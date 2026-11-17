import type { ReactNode } from 'react'

/**
 * Petit rendu Markdown pour les réponses du coach : titres, listes, gras, italique, code, liens, séparateurs.
 * Construit des éléments React (pas de HTML brut), donc rien de ce que renvoie l'IA ne peut s'exécuter.
 */

type Block =
  | { kind: 'h'; level: number; text: string }
  | { kind: 'p'; text: string }
  | { kind: 'ul' | 'ol'; items: string[]; start: number }
  | { kind: 'hr' }
  | { kind: 'code'; text: string }

const UL = /^\s*[-*+•]\s+(.*)$/
const OL = /^\s*(\d+)[.)]\s+(.*)$/
const H = /^(#{1,6})\s+(.*?)\s*#*$/
const HR = /^\s*([-*_])(\s*\1){2,}\s*$/

export function parseBlocks(src: string): Block[] {
  const lines = src.replace(/\r\n?/g, '\n').split('\n')
  const out: Block[] = []
  let para: string[] = []
  const flush = () => {
    if (para.length) out.push({ kind: 'p', text: para.join('\n') })
    para = []
  }
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (/^\s*```/.test(line)) {
      flush()
      const code: string[] = []
      while (++i < lines.length && !/^\s*```/.test(lines[i])) code.push(lines[i])
      out.push({ kind: 'code', text: code.join('\n') })
      continue
    }
    if (!line.trim()) {
      flush()
      continue
    }
    if (HR.test(line)) {
      flush()
      out.push({ kind: 'hr' })
      continue
    }
    const h = H.exec(line)
    if (h) {
      flush()
      out.push({ kind: 'h', level: h[1].length, text: h[2] })
      continue
    }
    const ul = UL.exec(line)
    const ol = OL.exec(line)
    if (ul || ol) {
      flush()
      const kind = ul ? 'ul' : 'ol'
      const last = out[out.length - 1]
      const item = ul ? ul[1] : ol![2]
      if (last && last.kind === kind) last.items.push(item)
      else out.push({ kind, items: [item], start: ol ? Number(ol[1]) : 1 })
      continue
    }
    // Ligne de suite d'un élément de liste (indentée) : on la rattache à l'élément.
    const last = out[out.length - 1]
    if (!para.length && last && (last.kind === 'ul' || last.kind === 'ol') && /^\s{2,}\S/.test(line)) {
      last.items[last.items.length - 1] += '\n' + line.trim()
      continue
    }
    para.push(line)
  }
  flush()
  return out
}

const INLINE = /(`[^`]+`)|(\*\*[^*]+\*\*|__[^_]+__)|(\*[^*\s][^*]*\*|_[^_\s][^_]*_)|(\[[^\]]+\]\((https?:\/\/[^)\s]+)\))/g

export function inline(text: string, key = 'i'): ReactNode[] {
  const out: ReactNode[] = []
  let last = 0
  let n = 0
  for (const m of text.matchAll(INLINE)) {
    const at = m.index ?? 0
    if (at > last) out.push(text.slice(last, at))
    const k = `${key}-${n++}`
    const s = m[0]
    if (m[1]) out.push(<code key={k}>{s.slice(1, -1)}</code>)
    else if (m[2]) out.push(<strong key={k}>{inline(s.slice(2, -2), k)}</strong>)
    else if (m[3]) out.push(<em key={k}>{inline(s.slice(1, -1), k)}</em>)
    else if (m[4]) {
      const label = s.slice(1, s.indexOf(']('))
      out.push(<a key={k} href={m[5]} target="_blank" rel="noopener noreferrer">{label}</a>)
    }
    last = at + s.length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

/** Les retours à la ligne simples d'un paragraphe sont gardés. */
function lines(text: string, key: string): ReactNode[] {
  return text.split('\n').flatMap((l, i) => (i ? [<br key={`${key}-br${i}`} />, ...inline(l, `${key}-${i}`)] : inline(l, `${key}-${i}`)))
}

export function Markdown({ text }: { text: string }) {
  return (
    <div className="md">
      {parseBlocks(text).map((b, i) => {
        const k = `b${i}`
        switch (b.kind) {
          case 'h': {
            const Tag = (b.level <= 2 ? 'h4' : 'h5') as 'h4' | 'h5'
            return <Tag key={k}>{inline(b.text, k)}</Tag>
          }
          case 'ul':
            return <ul key={k}>{b.items.map((it, j) => <li key={j}>{lines(it, `${k}-${j}`)}</li>)}</ul>
          case 'ol':
            return <ol key={k} start={b.start}>{b.items.map((it, j) => <li key={j}>{lines(it, `${k}-${j}`)}</li>)}</ol>
          case 'hr':
            return <hr key={k} />
          case 'code':
            return <pre key={k}><code>{b.text}</code></pre>
          default:
            return <p key={k}>{lines(b.text, k)}</p>
        }
      })}
    </div>
  )
}
