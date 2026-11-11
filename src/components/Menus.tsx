import { useMemo, useState } from 'react'
import { macrosFor, sum } from '../lib/calc'
import { iso } from '../lib/date'
import { activeMenus, addItemsToDay, deleteMenu, newId, saveMenu, useStore } from '../lib/store'
import { MEALS, type Food, type Macros, type Meal, type Menu, type MenuItem } from '../lib/types'
import { FoodPicker } from './FoodPicker'

const r = (x: number) => Math.round(x)

export function useMenuTotals(items: MenuItem[]): Macros {
  const foods = useStore((s) => s.foods)
  return useMemo(() => sum(items.filter((it) => foods[it.food_id]).map((it) => macrosFor(foods[it.food_id], it.qty))), [items, foods])
}

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
  const [picking, setPicking] = useState<{ index: number | null } | null>(null)
  const total = useMenuTotals(items)
  const editingItem = picking?.index != null ? items[picking.index] : undefined

  return (
    <div className="modal" role="dialog" aria-label="Menu">
      <form
        className="sheet"
        onSubmit={(e) => {
          e.preventDefault()
          if (!name.trim() || items.length === 0) return
          onClose(saveMenu({ id: menu.id ?? newId(), name: name.trim(), items }))
        }}
      >
        <div className="sheet-head">
          <h2>{menu.id ? 'Modifier le menu' : 'Nouveau menu'}</h2>
          <button type="button" className="ghost" onClick={() => onClose()} aria-label="Fermer">✕</button>
        </div>
        <label>Nom du menu<input autoFocus={!menu.name} required value={name} onChange={(e) => setName(e.target.value)} placeholder="ex. Petit-déj avoine whey" /></label>

        <ul className="list compact">
          {items.map((it, i) => {
            const f = foods[it.food_id]
            return (
              <li key={i} onClick={() => f && setPicking({ index: i })} tabIndex={0} onKeyDown={(k) => k.key === 'Enter' && f && setPicking({ index: i })}>
                <div>
                  <span>{f ? f.name : 'Aliment supprimé'}</span>
                  <span className="muted small">{it.qty} {f?.unit ?? ''}</span>
                </div>
                <span className="small">{f ? r(macrosFor(f, it.qty).kcal) : 0} kcal</span>
              </li>
            )
          })}
        </ul>
        <button type="button" className="ghost add-line" onClick={() => setPicking({ index: null })}>+ Ajouter un aliment</button>

        <div className="menu-total">
          <span>Total</span>
          <MacroLine m={total} />
        </div>

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
  const [date, setDate] = useState(() => iso(new Date()))
  const [meal, setMeal] = useState<Meal>(() => {
    const h = new Date().getHours()
    return h < 11 ? 'Matin' : h < 15 ? 'Midi' : h < 18 ? 'Collation' : 'Soir'
  })
  return (
    <div className="modal" role="dialog" aria-label="Ajouter au journal">
      <form
        className="sheet"
        onSubmit={(e) => {
          e.preventDefault()
          const n = addItemsToDay(menu.items, date, meal)
          onClose(`« ${menu.name} » ajouté au repas ${meal} (${n} aliment${n > 1 ? 's' : ''}).`)
        }}
      >
        <div className="sheet-head">
          <h2>Ajouter « {menu.name} »</h2>
          <button type="button" className="ghost" onClick={() => onClose()} aria-label="Fermer">✕</button>
        </div>
        <label>Jour<input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
        <div className="seg">
          {MEALS.map((m) => (
            <button type="button" key={m} className={meal === m ? 'on' : ''} onClick={() => setMeal(m)}>{m}</button>
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
  return (
    <div className="card menu-card">
      <div className="menu-card-body" onClick={onEdit} tabIndex={0} onKeyDown={(k) => k.key === 'Enter' && onEdit()}>
        <h3>{menu.name}</h3>
        <p className="muted small">{menu.items.map((it) => foods[it.food_id]?.name).filter(Boolean).join(', ')}</p>
        <MacroLine m={total} />
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
  const list = q.trim() ? menus.filter((m) => m.name.toLowerCase().includes(q.trim().toLowerCase())) : menus

  return (
    <section>
      <div className="toolbar">
        <input type="search" placeholder={`Rechercher parmi ${menus.length} menus`} value={q} onChange={(e) => setQ(e.target.value)} />
        <button onClick={() => setEdit({})}>+ Nouveau menu</button>
      </div>
      {msg && <p className="note">{msg}</p>}
      {list.map((m) => (
        <MenuCard key={m.id} menu={m} onEdit={() => setEdit(m)} onAdd={() => setAdding(m)} />
      ))}
      {menus.length === 0 && (
        <div className="card empty">
          <p><strong>Aucun menu enregistré.</strong></p>
          <p className="muted small">Crée un menu ici, ou dans le Journal, utilise « Enregistrer comme menu » sur un repas déjà rempli.</p>
        </div>
      )}
      {edit && <MenuEditor menu={edit} onClose={() => setEdit(null)} />}
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
