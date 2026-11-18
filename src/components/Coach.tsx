import { useEffect, useRef, useState } from 'react'
import { askCoach, type CoachMessage } from '../lib/ai'
import { Markdown } from '../lib/markdown'
import { coachContext, foodsForMenu } from '../lib/aiContext'
import { iso } from '../lib/date'
import { activeChats, deleteChat, getState, newId, saveChat, useStore } from '../lib/store'
import { AiMenu, resolveItems } from './AiMenu'
import { mealLabel, type CoachProposal } from '../lib/types'
import { TabIcon } from './Icons'

const SUGGESTIONS = [
  'Comment se passe ma semaine ?',
  "Que manger ce soir avec ce qu'il me reste ?",
  "J'ai fait un cheat meal, comment je compense ?",
  'Comment atteindre mes protéines plus facilement ?',
]

const fmt = (d: string) => {
  const x = new Date(d)
  const today = new Date().toDateString() === x.toDateString()
  return today ? x.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : x.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
}

const fmtDay = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })

/** Proposition du coach dans sa réponse : résumé, puis relecture et confirmation avant écriture. */
function ProposalCard({ p, onOpen }: { p: CoachProposal; onOpen: () => void }) {
  const kcal = Math.round(p.items.reduce((t, it) => t + it.kcal, 0))
  const where = p.kind === 'journal' ? `${mealLabel(p.meal ?? 1)} · ${fmtDay(p.date ?? '')}` : p.portions && p.portions > 1 ? `Menu · ${p.portions} repas` : 'Menu'
  return (
    <div className="proposal">
      <div className="proposal-head">
        <strong>{p.name}</strong>
        <span className="muted small">{where} · ~{kcal} kcal</span>
      </div>
      <p className="muted small">{p.items.map((it) => `${it.name} ${it.qty}${it.unit === 'u' ? ' u' : ' ' + it.unit}`).join(', ')}</p>
      {p.done ? (
        <p className="proposal-done small">✓ {p.done}</p>
      ) : (
        <button className="small" onClick={onOpen}>
          {p.kind === 'journal' ? 'Vérifier et ajouter au journal' : 'Vérifier et enregistrer le menu'}
        </button>
      )}
    </div>
  )
}

/** Liste des discussions passées. */
function History({ current, onOpen, onClose }: { current: string; onOpen: (id: string) => void; onClose: () => void }) {
  const chats = useStore(activeChats)
  return (
    <div className="modal" role="dialog" aria-label="Historique des discussions">
      <div className="sheet">
        <div className="sheet-head">
          <h2>Historique</h2>
          <button className="ghost" onClick={onClose} aria-label="Fermer">✕</button>
        </div>
        <ul className="list pick chat-list">
          {chats.map((c) => (
            <li key={c.id} className={c.id === current ? 'on' : ''} onClick={() => onOpen(c.id)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && onOpen(c.id)}>
              <div>
                <strong>{c.title}</strong>
                <span className="muted small">
                  {fmt(c.updated_at)} · {c.messages.length} message{c.messages.length > 1 ? 's' : ''}
                </span>
              </div>
              <button
                className="ghost"
                aria-label={`Supprimer « ${c.title} »`}
                onClick={(e) => {
                  e.stopPropagation()
                  if (confirm(`Supprimer la discussion « ${c.title} » ?`)) deleteChat(c.id)
                }}
              >
                ✕
              </button>
            </li>
          ))}
          {chats.length === 0 && <li className="muted">Aucune discussion pour le moment.</li>}
        </ul>
      </div>
    </div>
  )
}

/**
 * Discussion avec le coach IA, qui voit ton profil et ton journal des 14 derniers jours.
 * Chaque discussion est gardée dans l'historique et synchronisée entre tes appareils.
 */
export function Coach() {
  // On rouvre la dernière discussion ; « Nouvelle discussion » en démarre une autre.
  const [chatId, setChatId] = useState(() => activeChats(getState())[0]?.id ?? newId())
  const chat = useStore((s) => s.chats[chatId], [chatId])
  const messages: CoachMessage[] = chat && !chat.deleted ? chat.messages : []
  const count = useStore((s) => activeChats(s).length)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState<string | null>(null) // id de la discussion qui attend une réponse
  const [err, setErr] = useState<string | null>(null)
  const [history, setHistory] = useState(false)
  const [menu, setMenu] = useState<string | null>(null)
  const [menuMsg, setMenuMsg] = useState<string | null>(null)
  // Proposition du coach ouverte pour relecture : message et position dans ce message.
  const [review, setReview] = useState<{ chat: string; msg: number; idx: number; p: CoachProposal } | null>(null)
  const end = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLTextAreaElement>(null)

  // Le champ grandit avec le texte (jusqu'à ~6 lignes, ensuite il défile).
  useEffect(() => {
    const el = input.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`
  }, [text])

  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' })
  }, [messages.length, busy, chatId])

  async function send(q: string) {
    const content = q.trim()
    if (!content || busy) return
    const id = chatId
    const before = messages
    const next: CoachMessage[] = [...before, { role: 'user', content }]
    saveChat(id, next)
    setText('')
    setBusy(id)
    setErr(null)
    setMenuMsg(null)
    try {
      const s = getState()
      const list = foodsForMenu(s.foods)
      const res = await askCoach(next, coachContext(s, iso(new Date())), list.text)
      // Les numéros d'aliments renvoyés par l'IA sont convertis tout de suite en aliments de Mes aliments.
      const proposals: CoachProposal[] = res.proposals.map((p) => ({ ...p, items: resolveItems(p.items, list.ids, getState().foods) }))
      saveChat(id, [...next, { role: 'assistant', content: res.reply, ...(proposals.length ? { proposals } : {}) }])
    } catch (e) {
      // La question n'a pas abouti : on la retire de la discussion et on la remet dans le champ,
      // pour pouvoir réessayer sans qu'elle soit envoyée deux fois.
      if (before.length) saveChat(id, before)
      else deleteChat(id)
      setText((t) => t || content)
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }

  /** Marque une proposition comme faite, dans la discussion où elle a été proposée. */
  function markDone(chat: string, msg: number, idx: number, done: string) {
    const c = getState().chats[chat]
    if (!c) return
    const msgs = c.messages.map((m, i) =>
      i === msg && m.proposals ? { ...m, proposals: m.proposals.map((p, j) => (j === idx ? { ...p, done } : p)) } : m,
    )
    saveChat(chat, msgs)
  }

  function open(id: string) {
    setChatId(id)
    setHistory(false)
    setErr(null)
    setMenuMsg(null)
  }

  return (
    <section className="coach">
      <div className="card">
        <div className="meal-head coach-head">
          <h3>{chat && !chat.deleted && messages.length ? chat.title : 'Nouvelle discussion'}</h3>
          <div className="coach-actions">
            {count > 0 && (
              <button className="ghost small" onClick={() => setHistory(true)}>
                Historique ({count})
              </button>
            )}
            {messages.length > 0 && (
              <button className="ghost small" onClick={() => open(newId())}>
                Nouvelle discussion
              </button>
            )}
          </div>
        </div>
        <p className="muted small">Le coach voit ton objectif et ton journal des 14 derniers jours. Ses conseils sont indicatifs et ne remplacent pas un avis médical.</p>
        <button className="secondary coach-menu" onClick={() => setMenu(text)}>
          <TabIcon id="sparkle" size={18} /> Créer un menu (texte ou image)
        </button>
        {menuMsg && <p className="note">{menuMsg}</p>}
        {messages.length === 0 && (
          <div className="chips">
            {SUGGESTIONS.map((s) => (
              <button key={s} className="secondary small" onClick={() => send(s)}>
                {s}
              </button>
            ))}
          </div>
        )}
        <div className="chat">
          {messages.map((m, i) => (
            <div key={i} className={`bubble ${m.role}`}>
              {m.role === 'assistant' ? <Markdown text={m.content} /> : m.content}
              {m.proposals?.map((p, j) => (
                <ProposalCard key={j} p={p} onOpen={() => setReview({ chat: chatId, msg: i, idx: j, p })} />
              ))}
            </div>
          ))}
          {busy === chatId && <div className="bubble assistant muted">Le coach réfléchit…</div>}
          <div ref={end} />
        </div>
        {err && <p className="note warn">{err}</p>}
        <form
          className="row coach-form"
          onSubmit={(e) => {
            e.preventDefault()
            send(text)
          }}
        >
          <textarea
            ref={input}
            rows={1}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              // Entrée envoie, Maj+Entrée va à la ligne (sur PC). Sur mobile, le bouton Envoyer.
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && window.matchMedia('(hover: hover)').matches) {
                e.preventDefault()
                send(text)
              }
            }}
            placeholder="Pose ta question"
            aria-label="Question au coach"
          />
          <button type="submit" disabled={!!busy || !text.trim()}>
            Envoyer
          </button>
        </form>
      </div>
      {history && <History current={chatId} onOpen={open} onClose={() => setHistory(false)} />}
      {review && (
        <AiMenu
          proposal={review.p}
          onClose={(done) => {
            if (done) markDone(review.chat, review.msg, review.idx, done)
            setReview(null)
          }}
        />
      )}
      {menu != null && (
        <AiMenu
          initialPrompt={menu}
          onClose={(done) => {
            setMenu(null)
            if (done) {
              setMenuMsg(done)
              setText('')
            }
          }}
        />
      )}
    </section>
  )
}
