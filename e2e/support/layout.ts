import { expect, type Page } from '@playwright/test'

/** A largura que nenhuma tela pode passar (seção 7). */
export const NARROW_SCREEN = { width: 360, height: 740 }

/**
 * Troca a fonte do site por uma larga em todos os carregamentos, desde o
 * primeiro desenho (o `goto` recarrega a página). O site usa a fonte do sistema:
 * um estouro que só aparece com a fonte do Linux passaria despercebido no Windows.
 */
export async function forceWideFont(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const sheet = new CSSStyleSheet()
    sheet.replaceSync(
      ':root { --font-sans: "DejaVu Sans", Verdana !important; --font-mono: "DejaVu Sans Mono", "Courier New" !important; }',
    )
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet]
  })
}

/** A largura média do "n", em % do corpo. Segoe UI, Roboto e Arial ficam perto de 56; DejaVu Sans e Verdana, de 63. */
export async function expectWideFont(page: Page): Promise<void> {
  const width = await page.evaluate(() => {
    const context = document.createElement('canvas').getContext('2d')
    if (!context) throw new Error('Sem canvas para medir a fonte.')
    context.font = `100px ${getComputedStyle(document.body).fontFamily}`
    return context.measureText('n'.repeat(20)).width / 20
  })
  expect(width, 'a fonte larga está aplicada (DejaVu Sans ou Verdana instalada)').toBeGreaterThan(62)
}

/**
 * O que passa da largura da janela, do maior para o menor, com os px. Olha três
 * coisas, porque cada uma esconde a outra:
 * - a página inteira (`scrollWidth`), que não acusa diálogo, aviso nem barra fixa;
 * - cada elemento e cada linha de texto visíveis, pela borda;
 * - o que rola ou é cortado dentro de um bloco. Reticências são corte de propósito.
 */
export async function sidewaysOverflows(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const tolerance = 0.5
    const root = document.documentElement
    const limit = root.clientWidth
    const found: Array<{ px: number; what: string }> = []
    const add = (px: number, what: string) => found.push({ px, what: `${what}: ${Math.round(px * 10) / 10} px` })

    const describe = (element: Element) => {
      const label = element.getAttribute('aria-label') ?? element.textContent ?? ''
      return `<${element.tagName.toLowerCase()}> "${label.replace(/\s+/g, ' ').trim().slice(0, 40)}"`
    }
    const clips = (style: CSSStyleDeclaration) => style.overflowX !== 'visible'
    /** Texto só para o leitor de tela: recortado até sumir. */
    const srOnly = [...document.querySelectorAll('*')].filter((element) => {
      const { clip, clipPath } = getComputedStyle(element)
      return clipPath === 'inset(50%)' || clip === 'rect(0px, 0px, 0px, 0px)'
    })

    /** O pedaço que aparece: o retângulo menos o que os blocos em volta cortam. */
    const visiblePart = (rect: DOMRect, from: Element) => {
      let { left, right } = rect
      let position = getComputedStyle(from).position
      for (let node = from.parentElement; node && position !== 'fixed'; node = node.parentElement) {
        const style = getComputedStyle(node)
        // Um absoluto só é cortado a partir de quem o posiciona.
        if (position === 'absolute' && style.position === 'static') continue
        if (node !== document.body && node !== root && clips(style)) {
          const box = node.getBoundingClientRect()
          left = Math.max(left, box.left)
          right = Math.min(right, box.right)
        }
        position = style.position
      }
      return { left, right }
    }

    const checkEdges = (rect: DOMRect, from: Element, what: () => string) => {
      if (rect.width === 0 || rect.height === 0) return
      const { left, right } = visiblePart(rect, from)
      if (right <= left) return
      if (right > limit + tolerance) add(right - limit, `${what()} passa da direita`)
      if (left < -tolerance) add(-left, `${what()} passa da esquerda`)
    }

    if (root.scrollWidth > limit) add(root.scrollWidth - limit, 'a página rola para o lado')

    for (const element of document.body.querySelectorAll('*')) {
      const style = getComputedStyle(element)
      if (style.visibility === 'hidden' || element.getClientRects().length === 0) continue
      if (srOnly.some((hidden) => hidden.contains(element))) continue
      checkEdges(element.getBoundingClientRect(), element, () => describe(element))

      const isField = ['INPUT', 'SELECT', 'TEXTAREA'].includes(element.tagName)
      const hiddenExtra = element.scrollWidth - element.clientWidth
      if (!isField && clips(style) && style.textOverflow !== 'ellipsis' && hiddenExtra > 0) {
        const cuts = style.overflowX === 'hidden' || style.overflowX === 'clip'
        add(hiddenExtra, `${describe(element)} ${cuts ? 'corta o conteúdo' : 'rola para o lado por dentro'}`)
      }

      for (const node of element.childNodes) {
        if (node.nodeType !== Node.TEXT_NODE || !node.textContent?.trim()) continue
        const range = document.createRange()
        range.selectNodeContents(node)
        for (const rect of range.getClientRects()) {
          // O próprio elemento também corta o texto dele.
          if (clips(style)) {
            const box = element.getBoundingClientRect()
            checkEdges(new DOMRect(box.left, rect.top, Math.min(rect.right, box.right) - box.left, rect.height), element, () => describe(element))
          } else {
            checkEdges(rect, element, () => `texto de ${describe(element)}`)
          }
        }
      }
    }
    return [...new Set(found.sort((a, b) => b.px - a.px).map((item) => item.what))].slice(0, 6)
  })
}

/** Nada carregando e a tela parada: só então a medida vale. */
export async function expectSettled(page: Page): Promise<void> {
  await expect(page.getByText(/Carregando|Procurando/)).toHaveCount(0)
  await page.evaluate(async () => {
    await document.fonts.ready
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
  })
}
