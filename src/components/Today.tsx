import { useMemo, useState } from 'react'
import { macrosFor, sum, targets } from '../lib/calc'
import { deleteEntry, newId, saveEntry, useStore } from '../lib/store'
import { MEALS, type Entry, type Food, type Macros, type Meal } from '../lib/types'
import { FoodForm, type FoodDraft } from './FoodForm'
import { useBarcodeFlow, useFoodSearch } from './Foods'
import { LazyScanner as Scanner } from './LazyScanner'

const iso = (d: Date) => {
  const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
  return z.toISOString().slice(0, 10)
}
const r = (x: number) => Math.round(x)
const qtyUnit = (f: Food) => (f.unit === 'u' ? 'u' : f.unit)

function Bar({ label, value, target, cls }: { label: string; value: number; target: number; cls: string }) {
  const pct = target > 0 ? value / target : 0
  return (
    <div className={`bar ${cls}`}>
      <div className="bar-label">
        <span>{label}</span>
        <span>
          <strong>{r(value)}</strong> / {r(target)} g
        </span>
      </div>
      <div className="bar-track">
        <div className={`bar-fill${pct > 1.05 ? ' over' : ''}`} style={{ width: `${Math.min(100, pct * 100)}%` }} />
      </div>
    </div>
  )
}

function Summary({ total, target }: { total: Macros; target: Macros }) {
  const left = target.kcal - total.kcal
  const pct = Math.min(1, total.kcal / target.kcal)
  return (
    <div className="card summary">
      <div className="ring" style={{ ['--p' as string]: pct }}>
        <div>
          <strong>{r(total.kcal)}</strong>
          <span className="muted small">/ {target.kcal} kcal</span>
        </div>
      </div>
      <div className="bars">
        <p className={left < 0 ? 'over-text' : 'muted'}>{left >= 0 ? `Reste ${r(left)} kcal` : `${r(-left)} kcal au-dessus de l'objectif`}</p>
        <Bar label="Protéines" value={total.protein} target={target.protein} cls="p" />
        <Bar label="Glucides" value={total.carbs} target={target.carbs} cls="c" />
        <Bar label="Lipides" value={total.fat} target={target.fat} cls="f" />
      </div>
    </div>
  )
}

/** Ajout ou modification d'une ligne de repas : choix de l'aliment puis quantité. */
function AddEntry({ meal, date, entry, onClose }: { meal: Meal; date: string; entry?: Entry; onClose: () => void }) {
  const foods = useStore((s) => s.foods)
  const [food, setFood] = useState<Food | null>(entry ? foods[entry.food_id] ?? null : null)
  const [qty, setQty] = useState(entry ? String(entry.qty) : '')
  const [q, setQ] = useState('')
  const [scan, setScan] = useState(false)
  const [draft, setDraft] = useState<FoodDraft | null>(null)
  const list = useFoodSearch(q)
  const pick = (f: Food) => {
    setFood(f)
    setQty(entry ? qty : f.unit === 'u' ? '1' : '100')
  }
  const onBarcode = useBarcodeFlow(pick, setDraft)
  const n = parseFloat(qty.replace(',', '.')) || 0
  const m = food ? macrosFor(food, n) : null

  return (
    <div className="modal" role="dialog" aria-label="Ajouter un aliment">
      <div className="sheet">
        <div className="sheet-head">
          <h2>{entry ? 'Modifier' : 'Ajouter'} · {meal}</h2>
          <button className="ghost" onClick={onClose} aria-label="Fermer">✕</button>
        </div>
        {!food ? (
          <>
            <div className="toolbar">
              <input autoFocus type="search" placeholder="Rechercher un aliment" value={q} onChange={(e) => setQ(e.target.value)} />
              <button className="secondary" onClick={() => setScan(true)} aria-label="Scanner">📷</button>
            </div>
            <ul className="list pick">
              {list.slice(0, 60).map((f) => (
                <li key={f.id} onClick={() => pick(f)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && pick(f)}>
                  <strong>{f.name}</strong>
                  <span className="muted small">{r(f.kcal)} kcal {f.unit === 'u' ? '/ u' : `/ 100 ${f.unit}`}</span>
                </li>
              ))}
              <li className="add" onClick={() => setDraft({ name: q })}>+ Créer « {q || 'nouvel aliment'} »</li>
            </ul>
          </>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              if (n <= 0) return
              saveEntry({ id: entry?.id ?? newId(), date, meal, food_id: food.id, qty: n })
              onClose()
            }}
          >
            <p className="picked">
              <strong>{food.name}</strong>
              {!entry && <button type="button" className="ghost small" onClick={() => setFood(null)}>changer</button>}
            </p>
            <label>
              Quantité ({food.unit === 'u' ? 'unités' : food.unit})
              <input autoFocus inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} />
            </label>
            {m && (
              <div className="macros">
                <span className="kcal">{r(m.kcal)} kcal</span>
                <span className="p">P {r(m.protein)} g</span>
                <span className="c">G {r(m.carbs)} g</span>
                <span className="f">L {r(m.fat)} g</span>
              </div>
            )}
            <div className="row end">
              {entry && (
                <button
                  type="button"
                  className="danger"
                  onClick={() => {
                    deleteEntry(entry.id)
                    onClose()
                  }}
                >
                  Retirer
                </button>
              )}
              <button type="submit">{entry ? 'Enregistrer' : 'Ajouter'}</button>
            </div>
          </form>
        )}
      </div>
      {scan && (
        <Scanner
          onResult={(c) => {
            setScan(false)
            onBarcode(c)
          }}
          onClose={() => setScan(false)}
        />
      )}
      {draft && (
        <FoodForm
          initial={draft}
          onClose={(saved) => {
            setDraft(null)
            if (saved) pick(saved)
          }}
        />
      )}
    </div>
  )
}

export function Today() {
  const [date, setDate] = useState(() => iso(new Date()))
  const [adding, setAdding] = useState<{ meal: Meal; entry?: Entry } | null>(null)
  const entries = useStore((s) => s.entries)
  const foods = useStore((s) => s.foods)
  const profile = useStore((s) => s.profile)
  const target = useMemo(() => targets(profile), [profile])

  const byMeal = useMemo(() => {
    const out = Object.fromEntries(MEALS.map((m) => [m, [] as { e: Entry; f: Food; m: Macros }[]])) as Record<Meal, { e: Entry; f: Food; m: Macros }[]>
    for (const e of Object.values(entries)) {
      if (e.deleted || e.date !== date) continue
      const f = foods[e.food_id]
      if (!f) continue
      ;(out[e.meal] ?? out.Collation).push({ e, f, m: macrosFor(f, e.qty) })
    }
    for (const m of MEALS) out[m].sort((a, b) => a.e.updated_at.localeCompare(b.e.updated_at))
    return out
  }, [entries, foods, date])

  const total = sum(MEALS.flatMap((m) => byMeal[m].map((x) => x.m)))
  const shift = (d: number) => {
    const x = new Date(date + 'T12:00:00')
    x.setDate(x.getDate() + d)
    setDate(iso(x))
  }
  const today = iso(new Date())
  const label = date === today ? "Aujourd'hui" : new Date(date + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <section>
      <div className="datebar">
        <button className="ghost" onClick={() => shift(-1)} aria-label="Jour précédent">‹</button>
        <button className="ghost date" onClick={() => setDate(today)}>{label}</button>
        <button className="ghost" onClick={() => shift(1)} aria-label="Jour suivant">›</button>
      </div>
      <Summary total={total} target={target} />
      {MEALS.map((meal) => {
        const rows = byMeal[meal]
        const t = sum(rows.map((x) => x.m))
        return (
          <div className="card meal" key={meal}>
            <div className="meal-head">
              <h3>{meal}</h3>
              <span className="muted small">
                {r(t.kcal)} kcal · P {r(t.protein)} · G {r(t.carbs)} · L {r(t.fat)}
              </span>
            </div>
            <ul className="list compact">
              {rows.map(({ e, f, m }) => (
                <li key={e.id} onClick={() => setAdding({ meal, entry: e })} tabIndex={0} onKeyDown={(k) => k.key === 'Enter' && setAdding({ meal, entry: e })}>
                  <div>
                    <span>{f.name}</span>
                    <span className="muted small">
                      {e.qty} {qtyUnit(f)}
                    </span>
                  </div>
                  <span className="small">{r(m.kcal)} kcal</span>
                </li>
              ))}
            </ul>
            <button className="ghost add-line" onClick={() => setAdding({ meal })}>+ Ajouter un aliment</button>
          </div>
        )
      })}
      {adding && <AddEntry meal={adding.meal} entry={adding.entry} date={date} onClose={() => setAdding(null)} />}
    </section>
  )
}
