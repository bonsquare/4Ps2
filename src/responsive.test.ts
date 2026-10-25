import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const css = readFileSync(new URL('./refresh.css', import.meta.url), 'utf8')

describe('payment report responsiveness', () => {
  it('keeps the compact side-by-side payment layout used before the regression', () => {
    expect(css).toContain('@media (min-width: 1180px)')
    expect(css).toContain('grid-template-columns: minmax(0, 1fr) 320px')
    expect(css).toContain('grid-template-columns: minmax(0, 1fr) 420px')
    expect(css).not.toContain('.payment-report { container-type: inline-size;')
  })
})
