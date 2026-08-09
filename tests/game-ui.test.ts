import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, test } from 'vitest'

import GameRoot from '@/components/game/GameRoot'

function renderGame(): string {
  return renderToStaticMarkup(createElement(GameRoot))
}

describe('game UI layout', () => {
  test('shop is always present in the right sidebar', () => {
    const html = renderGame()

    expect(html).toContain('data-layout="tank-with-shop-sidebar"')
    expect(html).toContain('data-testid="shop-panel"')
    expect(html).toContain('data-ui-anchor="right-sidebar"')
    expect(html).not.toContain('data-testid="shop-toggle"')
  })

  test('tools and toast stack are anchored inside the tank', () => {
    const html = renderGame()

    expect(html).toContain('data-testid="tool-palette"')
    expect(html).toContain('data-ui-anchor="top-left"')
    expect(html).toContain('data-testid="toast-stack"')
    expect(html).toContain('data-ui-anchor="bottom-left"')
  })
})
