import { useCallback, useMemo, useState } from 'react'
import { activeFoods, findByBarcode, useStore } from '../lib/store'
import { lookupBarcode } from '../lib/off'
import { dietMatches, unitLabel } from '../lib/calc'
import type { Diet, Food } from '../lib/types'
import { DietBadge, DietFilter } from './Diet'
import { FoodForm, type FoodDraft } from './FoodForm'
import { LazyScanner as Scanner } from './LazyScanner'

export const norm = (s: string) =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/œ/g, 'oe').replace(/æ/g, 'ae')

export function useFoodSearch(q: string, diet: Diet | null = null) {
  const foods = useStore(activeFoods)
  return useMemo(() => {
    const n = norm(q.trim())
    const byDiet = diet ? foods.filter((f) => dietMatches(f.diet, diet)) : foods
    return n ? byDiet.filter((f) => norm(f.name + ' ' + (f.brand ?? '')).includes(n) || f.barcode === q.trim()) : byDiet
  }, [foods, q, diet])
}

/** Scan -> aliment déjà connu, ou brouillon pré-rempli avec Open Food Facts. */
export function useBarcodeFlow(onFound: (f: Food) => void, onDraft: (d: FoodDraft) => void) {
  return useCallback(
    async (code: string) => {
      const known = findByBarcode(code)
      if (known) return onFound(known)
      try {
        const p = await lookupBarcode(code)
        onDraft(p ? { ...p, barcode: code } : { barcode: code })
      } catch {
        onDraft({ barcode: code })
      }
    },
    [onFound, onDraft],
  )
}

export function Foods() {
  const [q, setQ] = useState('')
  const [edit, setEdit] = useState<FoodDraft | null>(null)
  const [scan, setScan] = useState(false)
  const [diet, setDiet] = useState<Diet | null>(null)
  const list = useFoodSearch(q, diet)
  const onBarcode = useBarcodeFlow(setEdit, setEdit)

  return (
    <section>
      <div className="toolbar">
        <input type="search" placeholder={`Rechercher parmi ${list.length} aliments`} value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="secondary" onClick={() => setScan(true)} aria-label="Scanner">📷</button>
        <button onClick={() => setEdit({ name: q, diet })}>+ Ajouter</button>
      </div>
      <DietFilter value={diet} onChange={setDiet} />
      <ul className="list">
        {list.map((f) => (
          <li key={f.id} onClick={() => setEdit(f)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setEdit(f)}>
            <div>
              <strong>
                {f.name} <DietBadge diet={f.diet} />
              </strong>
              <span className="muted small">
                {f.brand ? f.brand + ' · ' : ''}
                {unitLabel(f)}
                {f.barcode ? ' · 🏷️' : ''}
              </span>
            </div>
            <div className="macros small">
              <span className="kcal">{Math.round(f.kcal)} kcal</span>
              <span className="p">P {f.protein}</span>
              <span className="c">G {f.carbs}</span>
              <span className="f">L {f.fat}</span>
            </div>
          </li>
        ))}
        {list.length === 0 && <li className="muted">{diet ? 'Aucun aliment de cette catégorie. Change le filtre ou indique le régime dans la fiche de l\'aliment.' : 'Aucun aliment. Ajoute-le ou scanne-le.'}</li>}
      </ul>
      {scan && (
        <Scanner
          onResult={(c) => {
            setScan(false)
            onBarcode(c)
          }}
          onClose={() => setScan(false)}
        />
      )}
      {edit && <FoodForm initial={edit} onClose={() => setEdit(null)} />}
    </section>
  )
}
