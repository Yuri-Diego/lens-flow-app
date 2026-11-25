import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { api, type Box, type SessionUser } from '@/lib/api'
import { draftStorageKey } from '@/lib/draft/drafts'
import type { OutboxEntry } from './launchOutbox'
import { adminUser, makeBox, makeMovement, mockApi, operatorUser, renderApp, todayHandlers, unauthenticated } from '@/test/utils'

const ana = adminUser
const joao = operatorUser
const EXPIRED = 'Sua sessão expirou. Entre de novo.'

/** Uma resposta que o teste solta quando quiser. */
function gate() {
  let open: () => void = () => {}
  const opened = new Promise<void>((resolve) => {
    open = resolve
  })
  return { open: () => act(async () => open()), opened }
}

const refused = { status: 409, data: { error: { code: 'BOX_OCCUPIED', message: 'A caixa 12 já está ocupada.' } } }
const launched = (client = 'Ótica Um') => ({
  status: 201,
  data: { movement: makeMovement({ id: 'novo-1', boxNumber: '12', clientName: client }), warnings: [] },
})

interface Post {
  boxId: string
  clientName: string
  clientRequestId: string
  /** Quem estava logado quando o lançamento chegou à API. */
  as: string | undefined
}

function setup(path = '/servicos/novo', onPost: (post: Post, count: number) => unknown = () => launched()) {
  const state = {
    session: ana as SessionUser | null,
    box: makeBox({ number: '12', color: 'vermelha' }) as Box,
    boxGate: null as Promise<void> | null,
    logoutReply: { status: 204 } as { status: number } | 'network-error',
    logoutGate: null as Promise<void> | null,
    logouts: 0,
  }
  const posts: Post[] = []
  mockApi({
    ...todayHandlers,
    'GET /auth/me': () => (state.session ? { status: 200, data: { user: state.session } } : unauthenticated(EXPIRED)),
    'GET /health': () => unauthenticated(EXPIRED),
    'POST /auth/logout': async () => {
      state.logouts += 1
      await state.logoutGate
      if (state.logoutReply === 'network-error' || state.logoutReply.status >= 400) return state.logoutReply
      state.session = null
      return state.logoutReply
    },
    'POST /auth/login': (config) => {
      state.session = JSON.parse(config.data as string).username === 'ana' ? ana : joao
      return { status: 200, data: { user: state.session } }
    },
    'GET /boxes': async () => {
      await state.boxGate
      return { status: 200, data: { boxes: [state.box] } }
    },
    'GET /movements': { status: 200, data: { items: [], nextCursor: null, serverDate: '2026-11-23' } },
    'GET /clients/suggestions': { status: 200, data: { items: [] } },
    'POST /movements': (config) => {
      const post = { ...JSON.parse(config.data as string), as: state.session?.username }
      posts.push(post)
      return onPost(post, posts.length) as ReturnType<typeof launched>
    },
  })
  const user = userEvent.setup()
  const view = renderApp(path)

  // De uma vez, sem simular tecla por tecla: aqui importa o que acontece depois.
  async function fill(label: string, value: string) {
    fireEvent.change(await screen.findByLabelText(label), { target: { value } })
  }
  async function launch(button = 'Salvar e próximo') {
    await fill('Caixa', '12')
    await screen.findByText('Livre · escolhida')
    await fill('Cliente', 'Ótica Um')
    await fill('OS (opcional)', '4521')
    await fill('Observação (opcional)', 'com pressa')
    await user.click(screen.getByRole('button', { name: button }))
  }
  async function go(to: string, title: string) {
    await act(() => view.router.navigate(to))
    await screen.findByRole('heading', { name: title })
  }
  async function tap(button: 'Trocar usuário' | 'Sair') {
    await user.click(within(screen.getByRole('banner')).getByRole('button', { name: button }))
  }
  async function leave(button: 'Trocar usuário' | 'Sair') {
    await tap(button)
    const confirm = screen.queryByRole('button', { name: 'Sair mesmo assim' })
    if (confirm) await user.click(confirm)
    await screen.findByRole('button', { name: 'Entrar' })
  }
  async function enter(username: 'ana' | 'joao') {
    await fill('Usuário', username)
    await fill('Senha', 'senha-certa-123')
    await user.click(screen.getByRole('button', { name: 'Entrar' }))
    await screen.findByRole('banner')
  }
  async function expire() {
    state.session = null
    await act(async () => {
      await api.get('/health').catch(() => {})
    })
    await screen.findByRole('button', { name: 'Entrar' })
  }
  return { ...view, user, state, posts, fill, launch, go, tap, leave, enter, expire }
}

const notices = () => within(screen.getByRole('region', { name: 'Avisos' }))
const findNotice = (text: RegExp) => notices().findByText(text)
const toFix = () => screen.queryByRole('region', { name: 'Lançamentos para corrigir' })
const settle = () => act(() => new Promise((resolve) => setTimeout(resolve, 50)))

async function fixFromNotice(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await notices().findByRole('button', { name: 'Corrigir' }))
}

async function expectFormBack() {
  await waitFor(() => expect(screen.getByLabelText('Cliente')).toHaveValue('Ótica Um'))
  expect(screen.getByLabelText('Caixa')).toHaveValue('12')
  expect(screen.getByLabelText('OS (opcional)')).toHaveValue('4521')
  expect(screen.getByLabelText('Observação (opcional)')).toHaveValue('com pressa')
  await waitFor(() => expect(notices().queryByText(/não foi lançada/)).not.toBeInTheDocument())
  expect(toFix()).not.toBeInTheDocument()
}

describe('Nenhum lançamento se perde', () => {
  it('o envio falha depois de sair da tela: está na lista ao voltar, com tudo o que foi digitado', async () => {
    const { opened, open } = gate()
    const { launch, go, user } = setup('/servicos/novo', () => opened.then(() => refused))
    await launch()
    await go('/hoje', 'Hoje')
    await open()
    await findNotice(/Caixa 12 \(Ótica Um\) não foi lançada/)

    await go('/servicos/novo', 'Novo serviço')
    await user.click(within(toFix() as HTMLElement).getByRole('button', { name: 'Corrigir' }))
    await expectFormBack()
  })

  it('"Corrigir" do aviso leva ao lançamento a partir de outra tela', async () => {
    const { opened, open } = gate()
    const { launch, go, user, router } = setup('/servicos/novo', () => opened.then(() => refused))
    await launch()
    await go('/hoje', 'Hoje')
    await open()
    await fixFromNotice(user)

    await expectFormBack()
    expect(router.state.location.pathname).toBe('/servicos/novo')
    expect(router.state.location.state).toBeNull()
  })

  it('"Corrigir" do aviso ainda funciona depois de sair da tela e voltar', async () => {
    const { launch, go, user } = setup('/servicos/novo', () => refused)
    await launch()
    await findNotice(/não foi lançada/)
    await go('/hoje', 'Hoje')
    await go('/servicos/novo', 'Novo serviço')
    await fixFromNotice(user)
    await expectFormBack()
  })

  it('"Concluir" que falha depois de sair da tela também vai para a lista', async () => {
    const { opened, open } = gate()
    const { launch, go, user } = setup('/servicos/novo', () => opened.then(() => refused))
    await launch('Concluir')
    await go('/buscar', 'Buscar')
    await open()
    await fixFromNotice(user)
    await expectFormBack()
  })

  it('"Concluir" que entra depois de sair da tela não tira a pessoa de onde ela está', async () => {
    const { opened, open } = gate()
    const { launch, go, router } = setup('/servicos/novo', () => opened.then(() => launched()))
    await launch('Concluir')
    await go('/buscar', 'Buscar')
    await open()
    await findNotice(/Lançado na caixa 12/)
    expect(router.state.location.pathname).toBe('/buscar')
  })

  it('salvar e sair da tela antes de a busca da caixa responder não derruba o envio', async () => {
    const box = gate()
    const { fill, go, user, state, posts } = setup()
    state.boxGate = box.opened
    await fill('Caixa', '12')
    await fill('Cliente', 'Ótica Um')
    await user.click(screen.getByRole('button', { name: 'Salvar e próximo' }))
    await go('/hoje', 'Hoje')
    await box.open()
    await findNotice(/Lançado na caixa 12/)
    expect(posts).toHaveLength(1)
  })

  it('a página recarregou no meio do envio: avisa e guarda para reenviar com a mesma chave', async () => {
    const form = { boxNumber: '12', clientName: 'Ótica Um', orderService: '4521', note: 'com pressa' }
    sessionStorage.setItem(
      draftStorageKey(ana.id, 'new-movement-failed'),
      JSON.stringify([
        { requestId: 'chave-antes-de-recarregar', form, status: 'sending', message: 'O envio foi interrompido.', fields: {}, sameRequest: true },
      ]),
    )
    const { user, posts } = setup('/hoje')
    await findNotice(/O envio foi interrompido/)
    await fixFromNotice(user)
    await expectFormBack()
    await user.click(screen.getByRole('button', { name: 'Salvar e próximo' }))
    await findNotice(/Lançado na caixa 12/)
    expect(posts.map((post) => post.clientRequestId)).toEqual(['chave-antes-de-recarregar'])
  })
})

describe('Fim de sessão com lançamento pendente ou recusado (R17)', () => {
  it('a sessão expira no envio: a própria pessoa reencontra o lançamento', async () => {
    const { launch, enter, state, posts, user } = setup('/servicos/novo', (_post, count) => {
      if (count > 1) return launched()
      state.session = null
      return unauthenticated(EXPIRED)
    })
    await launch()
    await screen.findByText(EXPIRED)
    expect(notices().queryByText(/Ótica Um/)).not.toBeInTheDocument()

    await enter('ana')
    await screen.findByRole('region', { name: 'Lançamentos para corrigir' })
    await user.click(screen.getByRole('button', { name: 'Corrigir' }))
    await expectFormBack()

    await user.click(screen.getByRole('button', { name: 'Salvar e próximo' }))
    await findNotice(/Lançado na caixa 12/)
    expect(posts[1].clientRequestId).toBe(posts[0].clientRequestId)
  })

  it('o envio falha depois da troca de usuário: nada aparece para o seguinte, e quem volta reencontra', async () => {
    const { opened, open } = gate()
    const { launch, go, leave, enter, user } = setup('/servicos/novo', () => opened.then(() => refused))
    await launch()
    await go('/hoje', 'Hoje')
    await leave('Trocar usuário')
    await enter('joao')
    await open()
    await settle()

    expect(screen.queryByText(/Ótica Um/)).not.toBeInTheDocument()
    await go('/servicos/novo', 'Novo serviço')
    expect(toFix()).not.toBeInTheDocument()
    expect(screen.getByLabelText('Cliente')).toHaveValue('')

    await go('/hoje', 'Hoje')
    await leave('Trocar usuário')
    await enter('ana')
    await findNotice(/Caixa 12 \(Ótica Um\) não foi lançada/)
    await fixFromNotice(user)
    await expectFormBack()
  })

  it('o envio falha com ninguém logado: nada aparece no login, e quem volta reencontra', async () => {
    const { opened, open } = gate()
    const { launch, leave, enter } = setup('/servicos/novo', () => opened.then(() => refused))
    await launch()
    await leave('Trocar usuário')
    await open()
    await settle()
    expect(screen.queryByText(/Ótica Um/)).not.toBeInTheDocument()

    await enter('ana')
    expect(await screen.findByRole('region', { name: 'Lançamentos para corrigir' })).toHaveTextContent('Ótica Um')
  })

  it.each(['Salvar e próximo', 'Concluir'])(
    'o envio de "%s" que ainda não chegou à API não sai em nome de quem entrou depois',
    async (button) => {
      const box = gate()
      const { launch, leave, enter, state, posts } = setup()
      await screen.findByLabelText('Caixa')
      const launching = launch(button)
      await screen.findByText('Livre · escolhida')
      state.boxGate = box.opened
      await launching
      await leave('Trocar usuário')
      await enter('joao')
      await box.open()
      await settle()
      expect(posts).toEqual([])
      expect(screen.queryByText(/Ótica Um/)).not.toBeInTheDocument()

      await leave('Trocar usuário')
      await enter('ana')
      expect(await screen.findByRole('region', { name: 'Lançamentos para corrigir' })).toHaveTextContent('Ótica Um')
    },
  )

  it.each(['Salvar e próximo', 'Concluir'])('"Sair" apaga, e o envio de "%s" que falha depois não volta', async (button) => {
    const { opened, open } = gate()
    const { launch, leave, enter } = setup('/servicos/novo', () => opened.then(() => refused))
    await launch(button)
    await leave('Sair')
    await open()
    await settle()
    expect(JSON.stringify({ ...sessionStorage })).not.toContain('Ótica Um')

    await enter('ana')
    expect(screen.queryByText(/Ótica Um/)).not.toBeInTheDocument()
  })
})

describe('Reenvio sem lançar duas vezes (R13)', () => {
  it('a resposta se perdeu e a caixa já aparece ocupada pelo próprio lançamento: reenvia com a mesma chave', async () => {
    const { launch, go, user, state, posts, client } = setup('/servicos/novo', (_post, count) => {
      if (count > 1) return launched()
      state.box = {
        ...state.box,
        state: 'occupied',
        currentMovement: {
          id: 'novo-1',
          clientName: 'Ótica Um',
          orderService: '4521',
          status: 'open',
          sheetDate: '2026-11-23',
          createdAt: '2026-11-23T12:00:00.000Z',
          createdBy: { id: ana.id, name: ana.name },
        },
      }
      return 'network-error'
    })
    await launch()
    await findNotice(/não foi lançada/)
    await go('/hoje', 'Hoje')
    await fixFromNotice(user)
    await expectFormBack()
    await act(() => client.invalidateQueries({ queryKey: ['boxes'] }))
    await screen.findByText('Ocupada')

    await user.click(screen.getByRole('button', { name: 'Salvar e próximo' }))
    await findNotice(/Lançado na caixa 12/)
    expect(posts).toHaveLength(2)
    expect(posts[1].clientRequestId).toBe(posts[0].clientRequestId)
  })

  it('a chave continua com o lançamento corrigido depois de sair da tela e voltar', async () => {
    const { launch, go, user, posts } = setup('/servicos/novo', (_post, count) => (count > 1 ? launched() : 'network-error'))
    await launch()
    await fixFromNotice(user)
    await expectFormBack()
    await go('/hoje', 'Hoje')
    await go('/servicos/novo', 'Novo serviço')
    await screen.findByText('Livre · escolhida')
    await user.click(screen.getByRole('button', { name: 'Salvar e próximo' }))
    await findNotice(/Lançado na caixa 12/)
    expect(posts[1].clientRequestId).toBe(posts[0].clientRequestId)
  })

  it('outro lançamento ganha outra chave', async () => {
    const { launch, posts } = setup()
    await launch()
    await findNotice(/Lançado na caixa 12/)
    await launch()
    await waitFor(() => expect(posts).toHaveLength(2))
    expect(posts[1].clientRequestId).not.toBe(posts[0].clientRequestId)
  })
})

describe('Avisos no fim da sessão (D12)', () => {
  it.each(['Trocar usuário', 'Sair', 'sessão expirada'] as const)(
    '%s: o aviso com o cliente e o "Desfazer" somem',
    async (how) => {
      const { launch, leave, expire } = setup()
      await launch()
      await findNotice(/Lançado na caixa 12: Ótica Um/)
      if (how === 'sessão expirada') await expire()
      else await leave(how)
      expect(notices().queryByText(/Ótica Um/)).not.toBeInTheDocument()
      expect(notices().queryByRole('button', { name: 'Desfazer' })).not.toBeInTheDocument()
    },
  )

  it.each(['Trocar usuário', 'Sair', 'sessão expirada'] as const)(
    '%s: o lançamento que entra depois não mostra o aviso a quem entrou',
    async (how) => {
      const { opened, open } = gate()
      const { launch, leave, expire, enter } = setup('/servicos/novo', () => opened.then(() => launched()))
      await launch()
      if (how === 'sessão expirada') await expire()
      else await leave(how)
      await enter('joao')
      await open()
      await settle()
      expect(screen.queryByText(/Ótica Um/)).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Desfazer' })).not.toBeInTheDocument()
    },
  )

  it('o aviso vermelho que não some sozinho também fecha', async () => {
    const { launch, leave } = setup('/servicos/novo', () => refused)
    await launch()
    await findNotice(/não foi lançada/)
    await leave('Trocar usuário')
    expect(screen.queryByText(/Ótica Um/)).not.toBeInTheDocument()
  })
})

describe('"Sair" com lançamento pendente (D27)', () => {
  const form = { boxNumber: '12', clientName: 'Ótica Um', orderService: '4521', note: 'com pressa' }
  const entry = (requestId: string, extra: Partial<OutboxEntry> = {}): OutboxEntry => ({
    requestId,
    form,
    status: 'failed',
    message: 'A caixa 12 já está ocupada.',
    fields: {},
    sameRequest: false,
    ...extra,
  })
  /** Lançamentos que já estavam guardados da Ana. */
  function keep(...entries: OutboxEntry[]) {
    sessionStorage.setItem(draftStorageKey(ana.id, 'new-movement-failed'), JSON.stringify(entries))
  }
  const refusedEntry = (id: string) => entry(id)
  const unconfirmedEntry = (id: string) => entry(id, { sameRequest: true })
  const dialog = () => screen.queryByRole('dialog', { name: 'Sair mesmo assim?' })
  const stored = () => JSON.stringify({ ...sessionStorage })

  describe('quando pergunta', () => {
    it.each(['/hoje', '/mais'])('no cabeçalho, em %s', async (path) => {
      keep(refusedEntry('a'))
      const { tap, state } = setup(path)
      await screen.findByRole('banner')
      await tap('Sair')
      expect(dialog()).toHaveTextContent('Há 1 lançamento que não entrou.')
      expect(state.logouts).toBe(0)
    })

    it('no "Mais"', async () => {
      keep(refusedEntry('a'))
      const { user, state } = setup('/mais')
      await screen.findByRole('heading', { name: 'Mais' })
      await user.click(within(screen.getByRole('main')).getByRole('button', { name: 'Sair' }))
      expect(dialog()).toHaveTextContent('Há 1 lançamento que não entrou.')
      expect(state.logouts).toBe(0)
    })

    it.each([
      [[refusedEntry('a'), refusedEntry('b')], ['Há 2 lançamentos que não entraram.']],
      [[unconfirmedEntry('a')], ['Há 1 lançamento sem confirmação: pode ou não ter entrado.']],
      [[unconfirmedEntry('a'), unconfirmedEntry('b')], ['Há 2 lançamentos sem confirmação: podem ou não ter entrado.']],
      [
        [refusedEntry('a'), unconfirmedEntry('b')],
        ['Há 1 lançamento que não entrou.', 'Há 1 lançamento sem confirmação: pode ou não ter entrado.'],
      ],
      [[entry('a', { status: 'parked', sent: true })], ['Há 1 lançamento que não entrou.']],
    ])('concorda em número e diz só o que se sabe (%#)', async (entries, sentences) => {
      keep(...entries)
      const { tap } = setup('/hoje')
      await screen.findByRole('banner')
      await tap('Sair')
      const texts = [...(dialog() as HTMLElement).querySelectorAll('p')].map((item) => item.textContent)
      expect(texts.slice(0, -1)).toEqual(sentences)
    })

    it.each(['Salvar e próximo', 'Concluir'])('"%s" em envio: diz que pode ou não entrar', async (button) => {
      const { opened, open } = gate()
      const { launch, tap } = setup('/servicos/novo', () => opened.then(() => launched()))
      await launch(button)
      await tap('Sair')
      expect(dialog()).toHaveTextContent('Há 1 lançamento ainda em envio: pode ou não entrar.')
      expect(dialog()).not.toHaveTextContent('não entrou')
      await open()
    })

    it('recusado ao "Concluir", ainda no formulário', async () => {
      const { launch, tap } = setup('/servicos/novo', () => refused)
      await launch('Concluir')
      await findNotice(/Não foi lançado/)
      await tap('Sair')
      expect(dialog()).toHaveTextContent('Há 1 lançamento que não entrou.')
    })

    it('de volta ao formulário por "Corrigir" e ainda não reenviado', async () => {
      const { launch, tap, user } = setup('/servicos/novo', () => refused)
      await launch()
      await fixFromNotice(user)
      await expectFormBack()
      await tap('Sair')
      expect(dialog()).toHaveTextContent('Há 1 lançamento que não entrou.')
    })
  })

  describe('quando não pergunta', () => {
    async function expectLeftAtOnce(tap: (button: 'Sair') => Promise<void>) {
      await tap('Sair')
      expect(dialog()).not.toBeInTheDocument()
      await screen.findByRole('button', { name: 'Entrar' })
      expect(stored()).not.toContain('Ótica Um')
    }

    it('sem pendência', async () => {
      const { tap } = setup('/hoje')
      await screen.findByRole('banner')
      await expectLeftAtOnce(tap)
    })

    it('com um rascunho só digitado', async () => {
      const { fill, tap } = setup()
      await fill('Caixa', '12')
      await fill('Cliente', 'Ótica Um')
      await expectLeftAtOnce(tap)
    })

    it('com um rascunho só digitado que deu lugar a outro', async () => {
      keep(entry('a', { status: 'parked' }))
      const { tap } = setup('/hoje')
      await screen.findByRole('banner')
      await expectLeftAtOnce(tap)
    })

    it('depois que o lançamento entrou', async () => {
      const { launch, tap } = setup()
      await launch()
      await findNotice(/Lançado na caixa 12/)
      await expectLeftAtOnce(tap)
    })

    it('depois de apagar do formulário o lançamento recusado e digitar outro', async () => {
      const { launch, fill, tap } = setup('/servicos/novo', () => refused)
      await launch('Concluir')
      await findNotice(/Não foi lançado/)
      for (const label of ['Caixa', 'Cliente', 'OS (opcional)', 'Observação (opcional)']) await fill(label, '')
      await fill('Cliente', 'Ótica Um')
      await expectLeftAtOnce(tap)
    })

    it.each(['Trocar usuário', 'sessão expirada'] as const)('%s continua guardando, sem perguntar', async (how) => {
      keep(refusedEntry('a'))
      const { tap, expire } = setup('/hoje')
      await screen.findByRole('banner')
      if (how === 'sessão expirada') await expire()
      else await tap(how)
      await screen.findByRole('button', { name: 'Entrar' })
      expect(dialog()).not.toBeInTheDocument()
      expect(stored()).toContain('Ótica Um')
    })
  })

  describe('com a pergunta aberta', () => {
    it.each(['Salvar e próximo', 'Concluir'])('"%s" entrou: a pergunta some, sem sair', async (button) => {
      const { opened, open } = gate()
      const { launch, tap, state } = setup('/servicos/novo', () => opened.then(() => launched()))
      await launch(button)
      await tap('Sair')
      expect(dialog()).toBeInTheDocument()
      await open()
      await waitFor(() => expect(dialog()).not.toBeInTheDocument())
      expect(state.logouts).toBe(0)
      expect(screen.getByRole('banner')).toBeInTheDocument()
    })

    it.each(['Salvar e próximo', 'Concluir'])('"%s" foi recusado: a pergunta passa a dizer que não entrou', async (button) => {
      const { opened, open } = gate()
      const { launch, tap } = setup('/servicos/novo', () => opened.then(() => refused))
      await launch(button)
      await tap('Sair')
      expect(dialog()).not.toHaveTextContent('não entrou')
      await open()
      await waitFor(() => expect(dialog()).toHaveTextContent('Há 1 lançamento que não entrou.'))
      expect(dialog()).not.toHaveTextContent('em envio')
    })

    it('um de dois entrou: continua perguntando só pelo outro', async () => {
      keep(refusedEntry('a'))
      const { opened, open } = gate()
      const { launch, tap } = setup('/servicos/novo', () => opened.then(() => launched()))
      await launch()
      await tap('Sair')
      expect(dialog()).toHaveTextContent('em envio')
      await open()
      await waitFor(() => expect(dialog()).not.toHaveTextContent('em envio'))
      expect(dialog()).toHaveTextContent('Há 1 lançamento que não entrou.')
    })
  })

  describe('voltar e sair', () => {
    it.each(['Voltar', 'Esc'])('o foco está em "Voltar"; %s leva à lista para corrigir, sem apagar', async (how) => {
      keep(refusedEntry('a'))
      const { tap, user, router, state } = setup('/hoje')
      await screen.findByRole('banner')
      await tap('Sair')
      expect(screen.getByRole('button', { name: 'Voltar' })).toHaveFocus()

      if (how === 'Esc') await user.keyboard('{Escape}')
      else await user.keyboard('{Enter}')
      await waitFor(() => expect(toFix()).toHaveFocus())
      expect(dialog()).not.toBeInTheDocument()
      expect(router.state.location.pathname).toBe('/servicos/novo')
      expect(router.state.location.state).toBeNull()
      expect(toFix()).toHaveTextContent('Ótica Um')
      expect(state.logouts).toBe(0)
    })

    it('já em "Novo serviço", "Voltar" leva o foco à lista', async () => {
      const { launch, tap, user } = setup('/servicos/novo', () => refused)
      await launch()
      await findNotice(/não foi lançada/)
      await tap('Sair')
      await user.click(screen.getByRole('button', { name: 'Voltar' }))
      await waitFor(() => expect(toFix()).toHaveFocus())
    })

    it('só com lançamento em envio, "Voltar" fica na mesma tela', async () => {
      const { opened, open } = gate()
      const { launch, go, tap, user, router } = setup('/servicos/novo', () => opened.then(() => launched()))
      await launch()
      await go('/hoje', 'Hoje')
      await tap('Sair')
      await user.click(screen.getByRole('button', { name: 'Voltar' }))
      expect(router.state.location.pathname).toBe('/hoje')
      await open()
      await findNotice(/Lançado na caixa 12/)
    })

    it('"Sair mesmo assim" sai e apaga', async () => {
      keep(refusedEntry('a'))
      const { tap, user, enter } = setup('/hoje')
      await screen.findByRole('banner')
      await tap('Sair')
      await user.click(screen.getByRole('button', { name: 'Sair mesmo assim' }))
      await screen.findByRole('button', { name: 'Entrar' })
      expect(stored()).not.toContain('Ótica Um')
      await enter('ana')
      expect(screen.queryByText(/Ótica Um/)).not.toBeInTheDocument()
    })

    it.each([['sem conexão', 'network-error' as const], ['erro do servidor', { status: 500 }]])(
      'se "Sair mesmo assim" falhar (%s), nada foi apagado; tentar de novo sai',
      async (_name, reply) => {
        keep(refusedEntry('a'), unconfirmedEntry('b'))
        const { tap, user, state, go } = setup('/hoje')
        await screen.findByRole('banner')
        const before = stored()
        state.logoutReply = reply
        await tap('Sair')
        await user.click(screen.getByRole('button', { name: 'Sair mesmo assim' }))

        await findNotice(/Não foi possível sair/)
        expect(dialog()).not.toBeInTheDocument()
        expect(state.logouts).toBe(1)
        expect(stored()).toBe(before)
        await go('/servicos/novo', 'Novo serviço')
        expect(within(toFix() as HTMLElement).getAllByRole('button', { name: 'Corrigir' })).toHaveLength(2)

        state.logoutReply = { status: 204 }
        await tap('Sair')
        await user.click(screen.getByRole('button', { name: 'Sair mesmo assim' }))
        await screen.findByRole('button', { name: 'Entrar' })
        expect(stored()).not.toContain('Ótica Um')
      },
    )

    it('nada é apagado antes de o servidor responder', async () => {
      keep(refusedEntry('a'))
      const { opened, open } = gate()
      const { tap, user, state } = setup('/hoje')
      await screen.findByRole('banner')
      state.logoutGate = opened
      await tap('Sair')
      await user.click(screen.getByRole('button', { name: 'Sair mesmo assim' }))
      expect(screen.getByRole('button', { name: 'Saindo…' })).toBeDisabled()
      expect(stored()).toContain('Ótica Um')
      // Esc não desfaz o que já foi pedido.
      await user.keyboard('{Escape}')
      expect(dialog()).toBeInTheDocument()

      await open()
      await screen.findByRole('button', { name: 'Entrar' })
      expect(state.logouts).toBe(1)
      expect(stored()).not.toContain('Ótica Um')
    })

    it('fica por cima dos avisos, que cobririam os botões no celular', async () => {
      const { launch, tap } = setup('/servicos/novo', () => refused)
      await launch()
      await findNotice(/não foi lançada/)
      await tap('Sair')
      expect(dialog()?.parentElement).toHaveClass('z-60')
    })
  })
})
