import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const css = readFileSync(new URL('./refresh.css', import.meta.url), 'utf8')

describe('payment report responsiveness', () => {
  it('uses the payment card width and reserves enough room for the donut', () => {
    expect(css).toContain('.payment-report { container-type: inline-size;')
    expect(css).toContain('@container (min-width: 1240px)')
    expect(css).toContain('grid-template-columns: minmax(0, 1fr) 400px')
  })
})
