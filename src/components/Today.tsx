import { useMemo, useState } from 'react'
import { macrosFor, sum, targets } from '../lib/calc'
import { activeMenus, addItemsToDay, deleteEntry, newId, saveEntry, useStore } from '../lib/store'
import { MEALS, type Entry, type Food, type Macros, type Meal, type Menu } from '../lib/types'
import { FoodPicker } from './FoodPicker'
import { iso } from '../lib/date'
import { MacroLine, MenuEditor, useMenuTotals } from './Menus'

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

function AddEntry({ meal, date, entry, onClose }: { meal: Meal; date: string; entry?: Entry; onClose: () => void }) {
  const foods = useStore((s) => s.foods)
  return (
    <FoodPicker
      title={`${entry ? 'Modifier' : 'Ajouter'} · ${meal}`}
      food={entry ? foods[entry.food_id] ?? null : null}
      qty={entry?.qty}
      submitLabel={entry ? 'Enregistrer' : 'Ajouter'}
      onSubmit={(food, qty) => saveEntry({ id: entry?.id ?? newId(), date, meal, food_id: food.id, qty })}
      onRemove={entry ? () => deleteEntry(entry.id) : undefined}
      onClose={onClose}
    />
  )
}

function MenuOption({ menu, onPick }: { menu: Menu; onPick: () => void }) {
  const total = useMenuTotals(menu.items)
  return (
    <li onClick={onPick} tabIndex={0} onKeyDown={(k) => k.key === 'Enter' && onPick()}>
      <strong>{menu.name}</strong>
      <MacroLine m={total} />
    </li>
  )
}

/** Ajoute un menu enregistré à un repas du jour. */
function MenuChooser({ meal, date, onClose }: { meal: Meal; date: string; onClose: () => void }) {
  const menus = useStore(activeMenus)
  return (
    <div className="modal" role="dialog" aria-label="Ajouter un menu">
      <div className="sheet">
        <div className="sheet-head">
          <h2>Ajouter un menu · {meal}</h2>
          <button className="ghost" onClick={onClose} aria-label="Fermer">✕</button>
        </div>
        <ul className="list pick">
          {menus.map((m) => (
            <MenuOption
              key={m.id}
              menu={m}
              onPick={() => {
                addItemsToDay(m.items, date, meal)
                onClose()
              }}
            />
          ))}
          {menus.length === 0 && <li className="muted">Aucun menu enregistré. Remplis un repas puis utilise « Enregistrer comme menu ».</li>}
        </ul>
      </div>
    </div>
  )
}

export function Today() {
  const [date, setDate] = useState(() => iso(new Date()))
  const [adding, setAdding] = useState<{ meal: Meal; entry?: Entry } | null>(null)
  const [choosing, setChoosing] = useState<Meal | null>(null)
  const [saving, setSaving] = useState<Partial<Menu> | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
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
            <div className="meal-actions">
              <button className="ghost add-line" onClick={() => setAdding({ meal })}>+ Aliment</button>
              <button className="ghost add-line" onClick={() => setChoosing(meal)}>+ Menu</button>
              {rows.length > 0 && (
                <button
                  className="ghost add-line save-menu"
                  onClick={() => setSaving({ name: meal, items: rows.map(({ e }) => ({ food_id: e.food_id, qty: e.qty })) })}
                >
                  Enregistrer comme menu
                </button>
              )}
            </div>
          </div>
        )
      })}
      {msg && <p className="note">{msg}</p>}
      {choosing && <MenuChooser meal={choosing} date={date} onClose={() => setChoosing(null)} />}
      {saving && (
        <MenuEditor
          menu={saving}
          onClose={(saved) => {
            setSaving(null)
            if (saved) setMsg(`Menu « ${saved.name} » enregistré. Retrouve-le dans l'onglet Mes menus.`)
          }}
        />
      )}
      {adding && <AddEntry meal={adding.meal} entry={adding.entry} date={date} onClose={() => setAdding(null)} />}
    </section>
  )
}
