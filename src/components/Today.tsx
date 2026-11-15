import { useMemo, useState } from 'react'
import { macrosFor, portionsOf, scaleMacros, sum, targets } from '../lib/calc'
import { activeMenus, addItemsToDay, deleteEntry, newId, saveEntry, useStore } from '../lib/store'
import { MEALS, type Entry, type Food, type Macros, type Meal, type Menu } from '../lib/types'
import { FoodPicker } from './FoodPicker'
import { iso } from '../lib/date'
import { MacroLine, MenuEditor, useMenuTotals } from './Menus'
import { Calendar } from './Calendar'
import { TabIcon } from './Icons'
import { dailyTotals, level, weekOf } from '../lib/history'
import { CheatToggle, ProgressCard, ProgressSheet } from './Progress'

const r = (x: number) => Math.round(x)
const qtyUnit = (f: Food) => (f.unit === 'u' ? 'u' : f.unit)
const DAYS = ['L', 'M', 'M', 'J', 'V', 'S', 'D']

/** Bandeau de la semaine : un point par jour enregistré, coloré selon l'écart à l'objectif. */
function WeekStrip({ date, today, target, onPick, onShift }: { date: string; today: string; target: number; onPick: (d: string) => void; onShift: (days: number) => void }) {
  const entries = useStore((s) => s.entries)
  const foods = useStore((s) => s.foods)
  const totals = useMemo(() => dailyTotals(entries, foods), [entries, foods])
  return (
    <div className="week">
      <button className="ghost week-nav" onClick={() => onShift(-7)} aria-label="Semaine précédente"><TabIcon id="chevL" size={18} /></button>
      {weekOf(date).map((d, i) => (
        <button
          key={d}
          type="button"
          className={['day', d === date ? 'cur' : '', d === today ? 'today' : '', totals[d] ? level(totals[d].kcal, target) : ''].join(' ')}
          onClick={() => onPick(d)}
          aria-label={new Date(d + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }) + (totals[d] ? ` : ${r(totals[d].kcal)} kcal` : '')}
          aria-pressed={d === date}
        >
          <span>{DAYS[i]}</span>
          <b>{+d.slice(8)}</b>
          <i aria-hidden />
        </button>
      ))}
      <button className="ghost week-nav" onClick={() => onShift(7)} aria-label="Semaine suivante"><TabIcon id="chevR" size={18} /></button>
    </div>
  )
}

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
  const portions = portionsOf(menu)
  return (
    <li onClick={onPick} tabIndex={0} onKeyDown={(k) => k.key === 'Enter' && onPick()}>
      <strong>
        {menu.name}
        {portions > 1 && <span className="badge batch">1 repas sur {portions}</span>}
      </strong>
      <MacroLine m={scaleMacros(total, 1 / portions)} />
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
                addItemsToDay(m.items, date, meal, portionsOf(m))
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

function shiftIso(d: string, days: number) {
  const x = new Date(d + 'T12:00:00')
  x.setDate(x.getDate() + days)
  return iso(x)
}

export function Today() {
  const [date, setDate] = useState(() => iso(new Date()))
  const [adding, setAdding] = useState<{ meal: Meal; entry?: Entry } | null>(null)
  const [choosing, setChoosing] = useState<Meal | null>(null)
  const [saving, setSaving] = useState<Partial<Menu> | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [calendar, setCalendar] = useState(false)
  const [progress, setProgress] = useState(false)
  const cheats = useStore((s) => s.profile.cheatMeals)
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
  const shift = (d: number) => setDate(shiftIso(date, d))
  const today = iso(new Date())
  const long = new Date(date + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
  const rel = date === today ? "Aujourd'hui" : shiftIso(today, -1) === date ? 'Hier' : shiftIso(today, 1) === date ? 'Demain' : null

  return (
    <section>
      <div className="day-head">
        <div>
          <p className="kicker">{rel ? long : new Date(date + 'T12:00:00').getFullYear()}</p>
          <h1>{rel ?? long}</h1>
        </div>
        {date !== today && <button className="chip" onClick={() => setDate(today)}>Aujourd'hui</button>}
        <button className="icon-btn" onClick={() => setCalendar(true)} aria-label="Ouvrir le calendrier"><TabIcon id="today" size={20} /></button>
      </div>
      <WeekStrip date={date} today={today} target={target.kcal} onPick={setDate} onShift={shift} />
      <Summary total={total} target={target} />
      <ProgressCard date={date} onOpen={() => setProgress(true)} />
      {MEALS.map((meal) => {
        const rows = byMeal[meal]
        const t = sum(rows.map((x) => x.m))
        return (
          <div className={'card meal' + (cheats?.includes(`${date}|${meal}`) ? ' cheat' : '')} key={meal}>
            <div className="meal-head">
              <h3>{meal}</h3>
              <span className="muted small">
                {r(t.kcal)} kcal · P {r(t.protein)} · G {r(t.carbs)} · L {r(t.fat)}
              </span>
              <CheatToggle date={date} meal={meal} />
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
              <button className="chip pri" onClick={() => setAdding({ meal })}>+ Aliment</button>
              <button className="chip" onClick={() => setChoosing(meal)}>+ Menu</button>
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
      {progress && <ProgressSheet date={date} onClose={() => setProgress(false)} />}
      {calendar && <Calendar date={date} onPick={setDate} onClose={() => setCalendar(false)} />}
      {adding && <AddEntry meal={adding.meal} entry={adding.entry} date={date} onClose={() => setAdding(null)} />}
    </section>
  )
}
