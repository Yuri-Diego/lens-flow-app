import { useState } from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { createQueryClient } from '@/app/queryClient'
import { mockApi } from '@/test/utils'
import { ClientNameField } from './ClientNameField'

const NAMES = ['Ótica Visão Clara', 'Ótica Central', 'Ótica Centro Sul', 'Oticas Diniz']

function suggestionsApi() {
  return mockApi({
    'GET /clients/suggestions': (config) => {
      const q = String((config.params as { q: string }).q)
      const fold = (text: string) => text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
      const items = NAMES.filter((name) => fold(name).startsWith(fold(q))).map((name, index) => ({
        name,
        uses: 10 - index,
        lastUsedAt: '2026-11-23T14:02:00.000Z',
      }))
      return { status: 200, data: { items } }
    },
  })
}

function setup() {
  const api = suggestionsApi()
  const onPick = vi.fn()
  const onEnter = vi.fn()
  function Harness() {
    const [value, setValue] = useState('')
    return (
      <>
        <ClientNameField
          label="Cliente"
          value={value}
          onValueChange={setValue}
          onPick={onPick}
          onKeyDown={(event) => {
            if (event.key === 'Enter') onEnter(value)
          }}
        />
        <input aria-label="OS" />
      </>
    )
  }
  const client = createQueryClient()
  render(
    <QueryClientProvider client={client}>
      <Harness />
    </QueryClientProvider>,
  )
  const suggestionCalls = () => api.calls.filter((call) => call.url === '/clients/suggestions')
  return { user: userEvent.setup(), onPick, onEnter, suggestionCalls, input: screen.getByRole('combobox', { name: 'Cliente' }) }
}

describe('Campo Cliente com sugestões (D24)', () => {
  it('é um combobox acessível e mostra os nomes já usados, sem acento e sem maiúsculas', async () => {
    const { user, input } = setup()
    expect(input).toHaveAttribute('aria-autocomplete', 'list')
    expect(input).toHaveAttribute('aria-expanded', 'false')

    await user.type(input, 'otica cen')

    const list = await screen.findByRole('listbox', { name: 'Clientes já usados' })
    expect(input).toHaveAttribute('aria-expanded', 'true')
    expect(input).toHaveAttribute('aria-controls', list.id)
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual(['Ótica Central', 'Ótica Centro Sul'])
  })

  it('espera a pessoa parar de digitar: uma busca só, com o texto inteiro', async () => {
    const { user, input, suggestionCalls } = setup()
    await user.type(input, 'Ótica')
    await screen.findByRole('listbox')

    expect(suggestionCalls()).toHaveLength(1)
  })

  it('setas e Enter escolhem e levam ao próximo campo; Esc fecha', async () => {
    const { user, input, onPick, onEnter } = setup()
    await user.type(input, 'ótica c')
    await screen.findByRole('listbox')

    await user.keyboard('{ArrowDown}{ArrowDown}')
    const options = screen.getAllByRole('option')
    expect(options[1]).toHaveAttribute('aria-selected', 'true')
    expect(input).toHaveAttribute('aria-activedescendant', options[1].id)

    await user.keyboard('{Enter}')
    expect(input).toHaveValue('Ótica Centro Sul')
    expect(onPick).toHaveBeenCalledWith('Ótica Centro Sul')
    // O Enter que escolheu não é o Enter que avança sem escolher.
    expect(onEnter).not.toHaveBeenCalled()
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()

    await user.clear(input)
    await user.type(input, 'ótica')
    await screen.findByRole('listbox')
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(input).toHaveValue('ótica')
  })

  it('um toque escolhe a sugestão', async () => {
    const { user, input, onPick } = setup()
    await user.type(input, 'ótica v')
    await user.click(await screen.findByRole('option', { name: 'Ótica Visão Clara' }))

    expect(input).toHaveValue('Ótica Visão Clara')
    expect(onPick).toHaveBeenCalledWith('Ótica Visão Clara')
  })

  it('o texto livre continua valendo: Enter sem escolher segue adiante com o que foi digitado', async () => {
    const { user, input, onEnter, onPick } = setup()
    await user.type(input, 'Ótica Nova')
    await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument())

    await user.keyboard('{Enter}')
    expect(onEnter).toHaveBeenCalledWith('Ótica Nova')
    expect(onPick).not.toHaveBeenCalled()
    expect(input).toHaveValue('Ótica Nova')
  })

  it('se a busca falhar, o campo segue funcionando sem lista', async () => {
    mockApi({ 'GET /clients/suggestions': 'network-error' })
    const client = createQueryClient()
    function Harness() {
      const [value, setValue] = useState('')
      return <ClientNameField label="Cliente" value={value} onValueChange={setValue} />
    }
    render(
      <QueryClientProvider client={client}>
        <Harness />
      </QueryClientProvider>,
    )
    const user = userEvent.setup()
    const input = screen.getByRole('combobox', { name: 'Cliente' })
    await user.type(input, 'Ótica')
    await new Promise((resolve) => setTimeout(resolve, 400))
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(input).toHaveValue('Ótica')
  })
})
