import { useEffect, useRef, useState } from 'react'
import { askCoach, type CoachMessage } from '../lib/ai'
import { coachContext } from '../lib/aiContext'
import { iso } from '../lib/date'
import { getState } from '../lib/store'

const KEY = 'kcalculator:coach'
const SUGGESTIONS = [
  'Comment se passe ma semaine ?',
  "Que manger ce soir avec ce qu'il me reste ?",
  "J'ai fait un cheat meal, comment je compense ?",
  'Comment atteindre mes protéines plus facilement ?',
]

function load(): CoachMessage[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]') as CoachMessage[]
  } catch {
    return []
  }
}

/** Discussion avec le coach IA, qui voit ton profil et ton journal des 14 derniers jours. */
export function Coach() {
  const [messages, setMessages] = useState<CoachMessage[]>(load)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const end = useRef<HTMLDivElement>(null)

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(messages.slice(-40)))
    } catch {
      /* ignore */
    }
    end.current?.scrollIntoView({ block: 'end' })
  }, [messages, busy])

  async function send(q: string) {
    const content = q.trim()
    if (!content || busy) return
    const next: CoachMessage[] = [...messages, { role: 'user', content }]
    setMessages(next)
    setText('')
    setBusy(true)
    setErr(null)
    try {
      const reply = await askCoach(next, coachContext(getState(), iso(new Date())))
      setMessages([...next, { role: 'assistant', content: reply }])
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="coach">
      <div className="card">
        <div className="meal-head">
          <h3>Coach</h3>
          {messages.length > 0 && (
            <button className="ghost small" onClick={() => setMessages([])}>Nouvelle discussion</button>
          )}
        </div>
        <p className="muted small">Le coach voit ton objectif et ton journal des 14 derniers jours. Ses conseils sont indicatifs et ne remplacent pas un avis médical.</p>
        {messages.length === 0 && (
          <div className="chips">
            {SUGGESTIONS.map((s) => (
              <button key={s} className="secondary small" onClick={() => send(s)}>{s}</button>
            ))}
          </div>
        )}
        <div className="chat">
          {messages.map((m, i) => (
            <div key={i} className={`bubble ${m.role}`}>{m.content}</div>
          ))}
          {busy && <div className="bubble assistant muted">Le coach réfléchit…</div>}
          <div ref={end} />
        </div>
        {err && <p className="note warn">{err}</p>}
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault()
            send(text)
          }}
        >
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Pose ta question" aria-label="Question au coach" />
          <button type="submit" disabled={busy || !text.trim()}>Envoyer</button>
        </form>
      </div>
    </section>
  )
}
