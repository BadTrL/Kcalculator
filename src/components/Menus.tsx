import { useMemo, useState } from 'react'
import { dietMatches, macrosFor, menuDiet, portionQty, portionsOf, scaleMacros, sum } from '../lib/calc'
import { iso } from '../lib/date'
import { activeMenus, addDays, addItemsToDay, dayMeals, deleteMenu, newId, saveMenu, useStore } from '../lib/store'
import { mealLabel, type Diet, type Food, type Macros, type Meal, type Menu, type MenuItem } from '../lib/types'
import { guessMeal } from '../lib/meals'
import { DietBadge, DietFilter } from './Diet'
import { FoodPicker } from './FoodPicker'
import { AiMenu } from './AiMenu'
import { TabIcon } from './Icons'

const r = (x: number) => Math.round(x)

export function useMenuTotals(items: MenuItem[]): Macros {
  const foods = useStore((s) => s.foods)
  return useMemo(() => sum(items.filter((it) => foods[it.food_id]).map((it) => macrosFor(foods[it.food_id], it.qty))), [items, foods])
}

export function useMenuDiet(items: MenuItem[]): Diet | null {
  const foods = useStore((s) => s.foods)
  return useMemo(() => menuDiet(items.map((it) => foods[it.food_id])), [items, foods])
}

const fmtDate = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })

export function MacroLine({ m }: { m: Macros }) {
  return (
    <div className="macros small">
      <span className="kcal">{r(m.kcal)} kcal</span>
      <span className="p">P {r(m.protein)}</span>
      <span className="c">G {r(m.carbs)}</span>
      <span className="f">L {r(m.fat)}</span>
    </div>
  )
}

/** Création / modification d'un menu : un nom et une liste d'aliments avec leurs quantités. */
export function MenuEditor({ menu, onClose }: { menu: Partial<Menu>; onClose: (saved?: Menu) => void }) {
  const foods = useStore((s) => s.foods)
  const [name, setName] = useState(menu.name ?? '')
  const [items, setItems] = useState<MenuItem[]>(menu.items ?? [])
  const [portionsTxt, setPortionsTxt] = useState(String(portionsOf(menu)))
  const portions = portionsOf({ portions: parseInt(portionsTxt, 10) })
  const [picking, setPicking] = useState<{ index: number | null } | null>(null)
  const total = useMenuTotals(items)
  const diet = useMenuDiet(items)
  const editingItem = picking?.index != null ? items[picking.index] : undefined

  return (
    <div className="modal" role="dialog" aria-label="Menu">
      <form
        className="sheet"
        onSubmit={(e) => {
          e.preventDefault()
          if (!name.trim() || items.length === 0) return
          onClose(saveMenu({ id: menu.id ?? newId(), name: name.trim(), items, portions }))
        }}
      >
        <div className="sheet-head">
          <h2>{menu.id ? 'Modifier le menu' : 'Nouveau menu'}</h2>
          <button type="button" className="ghost" onClick={() => onClose()} aria-label="Fermer">✕</button>
        </div>
        <label>Nom du menu<input autoFocus={!menu.name} required value={name} onChange={(e) => setName(e.target.value)} placeholder="ex. Petit-déj avoine whey" /></label>
        <label>
          Batch cooking : préparé pour combien de repas ?
          <input type="number" min={1} max={30} inputMode="numeric" value={portionsTxt} onChange={(e) => setPortionsTxt(e.target.value)} />
        </label>
        {portions > 1 && (
          <p className="muted small">
            Saisis les quantités totales à cuisiner. Chaque repas est une portion : les quantités divisées par {portions}.
          </p>
        )}

        <ul className="list compact">
          {items.map((it, i) => {
            const f = foods[it.food_id]
            return (
              <li key={i} onClick={() => f && setPicking({ index: i })} tabIndex={0} onKeyDown={(k) => k.key === 'Enter' && f && setPicking({ index: i })}>
                <div>
                  <span>{f ? f.name : 'Aliment supprimé'}</span>
                  <span className="muted small">
                    {it.qty} {f?.unit ?? ''}
                    {f && portions > 1 && ` · ${portionQty(it.qty, portions, f.unit)} ${f.unit} / repas`}
                  </span>
                </div>
                <span className="small">{f ? r(macrosFor(f, it.qty).kcal) : 0} kcal</span>
              </li>
            )
          })}
        </ul>
        <button type="button" className="ghost add-line" onClick={() => setPicking({ index: null })}>+ Ajouter un aliment</button>

        <div className="menu-total">
          <span>
            {portions > 1 ? `À cuisiner (${portions} repas)` : 'Total'} <DietBadge diet={diet} />
          </span>
          <MacroLine m={total} />
        </div>
        {portions > 1 && (
          <div className="menu-total portion">
            <span>Par repas (1 portion)</span>
            <MacroLine m={scaleMacros(total, 1 / portions)} />
          </div>
        )}

        <div className="row end">
          {menu.id && (
            <button
              type="button"
              className="danger"
              onClick={() => {
                if (confirm(`Supprimer le menu « ${name} » ?`)) {
                  deleteMenu(menu.id!)
                  onClose()
                }
              }}
            >
              Supprimer
            </button>
          )}
          <button type="submit" disabled={!name.trim() || items.length === 0}>Enregistrer</button>
        </div>
      </form>
      {picking && (
        <FoodPicker
          title={editingItem ? 'Modifier la quantité' : 'Ajouter au menu'}
          food={editingItem ? foods[editingItem.food_id] : null}
          qty={editingItem?.qty}
          submitLabel={editingItem ? 'Enregistrer' : 'Ajouter'}
          onSubmit={(food: Food, qty: number) =>
            setItems((xs) => (picking.index != null ? xs.map((x, i) => (i === picking.index ? { food_id: food.id, qty } : x)) : [...xs, { food_id: food.id, qty }]))
          }
          onRemove={picking.index != null ? () => setItems((xs) => xs.filter((_, i) => i !== picking.index)) : undefined}
          onClose={() => setPicking(null)}
        />
      )}
    </div>
  )
}

/** Choix du jour et du repas où ajouter un menu. */
function AddToJournal({ menu, onClose }: { menu: Menu; onClose: (msg?: string) => void }) {
  const portions = portionsOf(menu)
  const [date, setDate] = useState(() => iso(new Date()))
  const [spread, setSpread] = useState(false)
  const days = portions > 1 && spread ? portions : 1
  const meals = useStore((s) => dayMeals(s, date), [date])
  const [meal, setMeal] = useState<Meal>(() => guessMeal(meals.length))
  return (
    <div className="modal" role="dialog" aria-label="Ajouter au journal">
      <form
        className="sheet"
        onSubmit={(e) => {
          e.preventDefault()
          addItemsToDay(menu.items, date, meal, portions, days)
          onClose(
            days > 1
              ? `Une portion de « ${menu.name} » ajoutée au ${mealLabel(meal).toLowerCase()}, du ${fmtDate(date)} au ${fmtDate(addDays(date, days - 1))}.`
              : portions > 1
                ? `Une portion de « ${menu.name} » (1/${portions}) ajoutée au ${mealLabel(meal).toLowerCase()}.`
                : `« ${menu.name} » ajouté au ${mealLabel(meal).toLowerCase()}.`,
          )
        }}
      >
        <div className="sheet-head">
          <h2>Ajouter « {menu.name} »</h2>
          <button type="button" className="ghost" onClick={() => onClose()} aria-label="Fermer">✕</button>
        </div>
        <label>{days > 1 ? 'Premier jour' : 'Jour'}<input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
        {portions > 1 && (
          <label className="check">
            <input type="checkbox" checked={spread} onChange={(e) => setSpread(e.target.checked)} />
            Ajouter aussi ce repas les jours suivants ({portions} repas sur {portions} jours)
          </label>
        )}
        <div className="seg">
          {[...meals, meals.length + 1].map((m) => (
            <button type="button" key={m} className={meal === m ? 'on' : ''} onClick={() => setMeal(m)}>
              {m > meals.length ? '+ ' : ''}{mealLabel(m)}
            </button>
          ))}
        </div>
        <div className="row end"><button type="submit">Ajouter au journal</button></div>
      </form>
    </div>
  )
}

function MenuCard({ menu, onEdit, onAdd }: { menu: Menu; onEdit: () => void; onAdd: () => void }) {
  const foods = useStore((s) => s.foods)
  const total = useMenuTotals(menu.items)
  const diet = useMenuDiet(menu.items)
  const portions = portionsOf(menu)
  return (
    <div className="card menu-card">
      <div className="menu-card-body" onClick={onEdit} tabIndex={0} onKeyDown={(k) => k.key === 'Enter' && onEdit()}>
        <h3>
          {menu.name} <DietBadge diet={diet} />
          {portions > 1 && <span className="badge batch">Batch {portions} repas</span>}
        </h3>
        <p className="muted small">{menu.items.map((it) => foods[it.food_id]?.name).filter(Boolean).join(', ')}</p>
        {portions > 1 ? (
          <>
            <MacroLine m={scaleMacros(total, 1 / portions)} />
            <p className="muted small">par repas · total {Math.round(total.kcal)} kcal</p>
          </>
        ) : (
          <MacroLine m={total} />
        )}
      </div>
      <button className="secondary" onClick={onAdd}>+ Journal</button>
    </div>
  )
}

export function Menus() {
  const menus = useStore(activeMenus)
  const [q, setQ] = useState('')
  const [edit, setEdit] = useState<Partial<Menu> | null>(null)
  const [adding, setAdding] = useState<Menu | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [diet, setDiet] = useState<Diet | null>(null)
  const [batchOnly, setBatchOnly] = useState(false)
  const [ai, setAi] = useState(false)
  const foods = useStore((s) => s.foods)
  const list = menus.filter(
    (m) =>
      (!q.trim() || m.name.toLowerCase().includes(q.trim().toLowerCase())) &&
      (!diet || dietMatches(menuDiet(m.items.map((it) => foods[it.food_id])), diet)) &&
      (!batchOnly || portionsOf(m) > 1),
  )

  return (
    <section>
      <div className="toolbar">
        <input type="search" placeholder={`Rechercher parmi ${menus.length} menus`} value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="secondary" onClick={() => setAi(true)} title="Créer un menu avec l'IA, à partir d'une demande ou d'une image">
          <TabIcon id="sparkle" size={18} /> IA
        </button>
        <button onClick={() => setEdit({})}>+ Nouveau</button>
      </div>
      <div className="filters">
        <DietFilter value={diet} onChange={setDiet} />
        <button type="button" className={batchOnly ? 'chip on' : 'chip'} aria-pressed={batchOnly} onClick={() => setBatchOnly(!batchOnly)}>
          Batch cooking
        </button>
      </div>
      {msg && <p className="note">{msg}</p>}
      {list.map((m) => (
        <MenuCard key={m.id} menu={m} onEdit={() => setEdit(m)} onAdd={() => setAdding(m)} />
      ))}
      {menus.length > 0 && list.length === 0 && <p className="muted">Aucun menu ne correspond à ces filtres.</p>}
      {menus.length === 0 && (
        <div className="card empty">
          <p><strong>Aucun menu enregistré.</strong></p>
          <p className="muted small">Crée un menu ici, ou dans le Journal, utilise « Enregistrer comme menu » sur un repas déjà rempli.</p>
        </div>
      )}
      {edit && <MenuEditor menu={edit} onClose={() => setEdit(null)} />}
      {ai && (
        <AiMenu
          onClose={(saved) => {
            setAi(false)
            if (saved) setMsg(`Menu « ${saved.name} » créé. Touche-le pour le modifier.`)
          }}
        />
      )}
      {adding && (
        <AddToJournal
          menu={adding}
          onClose={(m) => {
            setAdding(null)
            if (m) setMsg(m)
          }}
        />
      )}
    </section>
  )
}
