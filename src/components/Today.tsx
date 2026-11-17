import { useMemo, useState } from 'react'
import { macrosFor, portionsOf, scaleMacros, sum, targets } from '../lib/calc'
import { activeMenus, addItemsToDay, deleteEntry, mealTime, newId, saveEntry, setMealTime, useStore } from '../lib/store'
import { mealLabel, type Entry, type Food, type Macros, type Meal, type Menu } from '../lib/types'
import { mealKey, mealsOfDay } from '../lib/meals'
import { FoodPicker } from './FoodPicker'
import { iso } from '../lib/date'
import { MacroLine, MenuEditor, useMenuTotals } from './Menus'
import { Calendar } from './Calendar'
import { TabIcon } from './Icons'
import { dailyTotals, level, weekOf } from '../lib/history'
import { CheatToggle, ProgressCard, ProgressSheet } from './Progress'
import { PhotoMeal } from './PhotoMeal'

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
      title={`${entry ? 'Modifier' : 'Ajouter'} · ${mealLabel(meal)}`}
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
          <h2>Ajouter un menu · {mealLabel(meal)}</h2>
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

/** Heure facultative d'un repas, enregistrée et synchronisée. */
function MealTime({ date, meal }: { date: string; meal: Meal }) {
  const time = useStore((s) => mealTime(s, date, meal), [date, meal])
  const label = `Heure du ${mealLabel(meal).toLowerCase()}`
  return (
    <span className={'meal-time' + (time ? ' set' : '')}>
      <input
        type="time"
        value={time ?? ''}
        onChange={(e) => setMealTime(date, meal, e.target.value || null)}
        aria-label={label}
        title={label}
      />
      {time && (
        <button type="button" className="ghost" onClick={() => setMealTime(date, meal, null)} aria-label={`Effacer l'heure du ${mealLabel(meal).toLowerCase()}`}>
          ✕
        </button>
      )}
    </span>
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
  const [photo, setPhoto] = useState<Meal | null>(null)
  const entries = useStore((s) => s.entries)
  const foods = useStore((s) => s.foods)
  const profile = useStore((s) => s.profile)
  const mealInfos = useStore((s) => s.meals)
  const target = useMemo(() => targets(profile), [profile])
  // Nombre de repas demandé à la main pour ce jour (« + Ajouter un repas »), tant qu'ils restent vides.
  const [extra, setExtra] = useState({ date, n: 0 })
  const extraN = extra.date === date ? extra.n : 0

  const { meals, byMeal } = useMemo(() => {
    const out = new Map<Meal, { e: Entry; f: Food; m: Macros }[]>()
    for (const e of Object.values(entries)) {
      if (e.deleted || e.date !== date) continue
      const f = foods[e.food_id]
      if (!f) continue
      const list = out.get(e.meal) ?? []
      list.push({ e, f, m: macrosFor(f, e.qty) })
      out.set(e.meal, list)
    }
    for (const list of out.values()) list.sort((a, b) => a.e.updated_at.localeCompare(b.e.updated_at))
    const timed = Object.values(mealInfos).filter((m) => m.date === date && !m.deleted && m.time).map((m) => m.meal)
    const meals = mealsOfDay(extraN || undefined, [...out.keys(), ...timed])
    return { meals, byMeal: (m: Meal) => out.get(m) ?? [] }
  }, [entries, foods, date, mealInfos, extraN])

  const total = sum(meals.flatMap((m) => byMeal(m).map((x) => x.m)))
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
      {meals.map((meal) => {
        const rows = byMeal(meal)
        const t = sum(rows.map((x) => x.m))
        return (
          <div className={'card meal' + (cheats?.includes(mealKey(date, meal)) ? ' cheat' : '')} key={meal}>
            <div className="meal-head">
              <h3>{mealLabel(meal)}</h3>
              <MealTime date={date} meal={meal} />
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
              <button className="chip" onClick={() => setPhoto(meal)}><TabIcon id="camera" size={16} /> Photo</button>
              {rows.length > 0 && (
                <button
                  className="ghost add-line save-menu"
                  onClick={() => setSaving({ name: mealLabel(meal), items: rows.map(({ e }) => ({ food_id: e.food_id, qty: e.qty })) })}
                >
                  Enregistrer comme menu
                </button>
              )}
            </div>
          </div>
        )
      })}
      <button className="add-meal" onClick={() => setExtra({ date, n: meals.length + 1 })} aria-label={`Ajouter un repas (${mealLabel(meals.length + 1)})`}>
        <span aria-hidden>+</span> {mealLabel(meals.length + 1)}
      </button>
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
      {photo && (
        <PhotoMeal
          date={date}
          meal={photo}
          onClose={(m) => {
            setPhoto(null)
            if (m) setMsg(m)
          }}
        />
      )}
      {calendar && <Calendar date={date} onPick={setDate} onClose={() => setCalendar(false)} />}
      {adding && <AddEntry meal={adding.meal} entry={adding.entry} date={date} onClose={() => setAdding(null)} />}
    </section>
  )
}
