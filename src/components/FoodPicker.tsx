import { useState } from 'react'
import { macrosFor } from '../lib/calc'
import type { Food } from '../lib/types'
import { FoodForm, type FoodDraft } from './FoodForm'
import { useBarcodeFlow, useFoodSearch } from './Foods'
import { LazyScanner as Scanner } from './LazyScanner'

const r = (x: number) => Math.round(x)

interface Props {
  title: string
  food?: Food | null
  qty?: number
  submitLabel: string
  onSubmit: (food: Food, qty: number) => void
  onRemove?: () => void
  onClose: () => void
}

/** Choix d'un aliment (recherche, scan ou création) puis de sa quantité. */
export function FoodPicker({ title, food: initialFood, qty: initialQty, submitLabel, onSubmit, onRemove, onClose }: Props) {
  const [food, setFood] = useState<Food | null>(initialFood ?? null)
  const [qty, setQty] = useState(initialQty != null ? String(initialQty) : '')
  const [q, setQ] = useState('')
  const [scan, setScan] = useState(false)
  const [draft, setDraft] = useState<FoodDraft | null>(null)
  const list = useFoodSearch(q)
  const editing = initialFood != null
  const pick = (f: Food) => {
    setFood(f)
    setQty(editing ? qty : f.unit === 'u' ? '1' : '100')
  }
  const onBarcode = useBarcodeFlow(pick, setDraft)
  const n = parseFloat(qty.replace(',', '.')) || 0
  const m = food ? macrosFor(food, n) : null

  return (
    <div className="modal" role="dialog" aria-label={title}>
      <div className="sheet">
        <div className="sheet-head">
          <h2>{title}</h2>
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
              onSubmit(food, n)
              onClose()
            }}
          >
            <p className="picked">
              <strong>{food.name}</strong>
              {!editing && <button type="button" className="ghost small" onClick={() => setFood(null)}>changer</button>}
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
              {onRemove && (
                <button
                  type="button"
                  className="danger"
                  onClick={() => {
                    onRemove()
                    onClose()
                  }}
                >
                  Retirer
                </button>
              )}
              <button type="submit">{submitLabel}</button>
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
