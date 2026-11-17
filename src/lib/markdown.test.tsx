import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { Markdown, parseBlocks } from './markdown'

const html = (t: string) => renderToStaticMarkup(<Markdown text={t} />)

describe('markdown du coach', () => {
  it('découpe titres, listes et paragraphes', () => {
    const b = parseBlocks('## Ta semaine\n\nBonne régularité.\n\n- Protéines : 120 g\n- Glucides : 200 g\n\n1. Ajoute un yaourt\n2. Garde le rythme')
    expect(b.map((x) => x.kind)).toEqual(['h', 'p', 'ul', 'ol'])
  })
  it('rend le gras, l’italique et le code', () => {
    expect(html('Vise **150 g** de *protéines* avec `skyr`')).toBe(
      '<div class="md"><p>Vise <strong>150 g</strong> de <em>protéines</em> avec <code>skyr</code></p></div>',
    )
  })
  it('n’interprète jamais le HTML renvoyé par l’IA', () => {
    expect(html('<img src=x onerror=alert(1)>')).not.toContain('<img')
  })
  it('n’accepte que les liens http(s)', () => {
    expect(html('[ok](https://ciqual.anses.fr)')).toContain('href="https://ciqual.anses.fr"')
    expect(html('[ko](javascript:alert(1))')).not.toContain('href')
  })
  it('garde les retours à la ligne simples', () => {
    expect(html('ligne 1\nligne 2')).toContain('ligne 1<br/>ligne 2')
  })
})
