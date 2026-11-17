import { useEffect, useState } from 'react'
import { dietMatches, macrosFor } from '../lib/calc'
import { findByBarcode } from '../lib/store'
import { searchOff, type OffHit } from '../lib/off'
import type { Food } from '../lib/types'
import { FoodForm, type FoodDraft } from './FoodForm'
import { useBarcodeFlow, useFoodSearch } from './Foods'
import { DietBadge, DietFilter } from './Diet'
import type { Diet } from '../lib/types'
import { LazyScanner as Scanner } from './LazyScanner'
import { TabIcon } from './Icons'

const r = (x: number) => Math.round(x)

/** Recherche Open Food Facts, lancée 600 ms après la dernière frappe (3 lettres minimum). */
function useOffSearch(q: string) {
  const [state, setState] = useState<{ q: string; hits: OffHit[]; err: string | null; busy: boolean }>({ q: '', hits: [], err: null, busy: false })
  const term = q.trim()
  useEffect(() => {
    if (term.length < 3) return
    const ctrl = new AbortController()
    const t = window.setTimeout(() => {
      setState((s) => ({ ...s, busy: true, err: null }))
      searchOff(term, ctrl.signal)
        .then((hits) => setState({ q: term, hits, err: null, busy: false }))
        .catch((e) => {
          if (ctrl.signal.aborted) return
          setState({ q: term, hits: [], busy: false, err: navigator.onLine ? (e instanceof Error ? e.message : String(e)) : 'Hors ligne : la base publique a besoin du réseau.' })
        })
    }, 600)
    return () => {
      window.clearTimeout(t)
      ctrl.abort()
    }
  }, [term])
  if (term.length < 3) return { hits: [], err: null, busy: false }
  return { hits: state.q === term ? state.hits : [], err: state.q === term ? state.err : null, busy: state.busy || state.q !== term }
}

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
  const [diet, setDiet] = useState<Diet | null>(null)
  const list = useFoodSearch(q, diet)
  const off = useOffSearch(q)
  const offHits = off.hits.filter((h) => !diet || dietMatches(h.diet, diet))
  const editing = initialFood != null
  const pick = (f: Food) => {
    setFood(f)
    setQty(editing ? qty : f.unit === 'u' ? '1' : '100')
  }
  const onBarcode = useBarcodeFlow(pick, setDraft)
  // Produit de la base publique : s'il est déjà dans Mes aliments on le prend, sinon on l'y ajoute (fiche à vérifier).
  const pickOff = (h: OffHit) => {
    const known = findByBarcode(h.barcode)
    if (known) pick(known)
    else setDraft(h)
  }
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
              <button className="secondary" onClick={() => setScan(true)} aria-label="Scanner un code-barres"><TabIcon id="scan" size={20} /></button>
            </div>
            <DietFilter value={diet} onChange={setDiet} />
            <p className="list-title">Mes aliments</p>
            <ul className="list pick">
              {list.slice(0, 60).map((f) => (
                <li key={f.id} onClick={() => pick(f)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && pick(f)}>
                  <strong>
                    {f.name} <DietBadge diet={f.diet} />
                  </strong>
                  <span className="muted small">{r(f.kcal)} kcal {f.unit === 'u' ? '/ u' : `/ 100 ${f.unit}`}</span>
                </li>
              ))}
              {list.length === 0 && q.trim() && <li className="muted small">Aucun de tes aliments ne correspond.</li>}
              <li className="add" onClick={() => setDraft({ name: q, diet })}>+ Créer « {q || 'nouvel aliment'} »</li>
            </ul>
            <p className="list-title">
              Base publique Open Food Facts
              {off.busy && <span className="muted small"> · recherche…</span>}
            </p>
            {q.trim().length < 3 ? (
              <p className="muted small">Tape au moins 3 lettres pour chercher aussi dans la base publique.</p>
            ) : off.err ? (
              <p className="note warn small">{off.err}</p>
            ) : (
              <ul className="list pick">
                {offHits.map((h) => (
                  <li key={h.barcode} onClick={() => pickOff(h)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && pickOff(h)}>
                    <strong>
                      {h.name} <DietBadge diet={h.diet} />
                    </strong>
                    <span className="muted small">
                      {h.brand ? h.brand + ' · ' : ''}
                      {r(h.kcal)} kcal / 100 {h.unit} · <span className="add-off">+ Mes aliments</span>
                    </span>
                  </li>
                ))}
                {!off.busy && offHits.length === 0 && <li className="muted small">Rien trouvé dans la base publique.</li>}
              </ul>
            )}
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
