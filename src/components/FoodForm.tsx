import { useState } from 'react'
import { deleteFood, newId, saveFood } from '../lib/store'
import { lookupBarcode } from '../lib/off'
import type { Food, Unit } from '../lib/types'
import { LazyScanner as Scanner } from './LazyScanner'

export type FoodDraft = Partial<Omit<Food, 'updated_at'>>

interface Props {
  initial: FoodDraft
  onClose: (saved?: Food) => void
}

const num = (s: string) => {
  const x = parseFloat(s.replace(',', '.'))
  return Number.isFinite(x) ? x : 0
}

export function FoodForm({ initial, onClose }: Props) {
  const [f, setF] = useState({
    name: initial.name ?? '',
    brand: initial.brand ?? '',
    unit: (initial.unit ?? 'g') as Unit,
    protein: String(initial.protein ?? ''),
    carbs: String(initial.carbs ?? ''),
    fat: String(initial.fat ?? ''),
    kcal: String(initial.kcal ?? ''),
    barcode: initial.barcode ?? '',
  })
  const [scan, setScan] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value })

  const theo = 4 * num(f.protein) + 4 * num(f.carbs) + 9 * num(f.fat)
  const gap = num(f.kcal) > 0 && Math.abs(theo - num(f.kcal)) / num(f.kcal) > 0.15

  async function fromBarcode(code: string) {
    setScan(false)
    setMsg('Recherche sur Open Food Facts…')
    try {
      const p = await lookupBarcode(code)
      if (!p) {
        setF((x) => ({ ...x, barcode: code }))
        setMsg('Produit introuvable sur Open Food Facts. Remplis les valeurs à la main.')
        return
      }
      setF((x) => ({
        ...x,
        barcode: code,
        name: x.name || p.name,
        brand: p.brand ?? x.brand,
        unit: p.unit,
        protein: String(p.protein),
        carbs: String(p.carbs),
        fat: String(p.fat),
        kcal: String(p.kcal),
      }))
      setMsg('Valeurs récupérées. Vérifie-les avec l\'étiquette avant d\'enregistrer.')
    } catch {
      setF((x) => ({ ...x, barcode: code }))
      setMsg('Pas de connexion à Open Food Facts. Remplis les valeurs à la main.')
    }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!f.name.trim()) return
    const saved = saveFood({
      id: initial.id ?? newId(),
      name: f.name.trim(),
      brand: f.brand.trim() || null,
      unit: f.unit,
      protein: num(f.protein),
      carbs: num(f.carbs),
      fat: num(f.fat),
      kcal: num(f.kcal) || Math.round(theo),
      barcode: f.barcode.trim() || null,
    })
    onClose(saved)
  }

  const per = f.unit === 'u' ? 'pour 1 unité' : `pour 100 ${f.unit}`

  return (
    <div className="modal" role="dialog" aria-label="Aliment">
      <form className="sheet" onSubmit={submit}>
        <div className="sheet-head">
          <h2>{initial.id ? 'Modifier l\'aliment' : 'Nouvel aliment'}</h2>
          <button type="button" className="ghost" onClick={() => onClose()} aria-label="Fermer">✕</button>
        </div>

        <button type="button" className="secondary wide" onClick={() => setScan(true)}>
          📷 Scanner le code-barres
        </button>
        {msg && <p className="note">{msg}</p>}

        <label>Nom<input required value={f.name} onChange={set('name')} placeholder="ex. Skyr nature" /></label>
        <div className="grid2">
          <label>Marque<input value={f.brand} onChange={set('brand')} /></label>
          <label>
            Valeurs données
            <select value={f.unit} onChange={set('unit')}>
              <option value="g">pour 100 g</option>
              <option value="ml">pour 100 ml</option>
              <option value="u">pour 1 unité</option>
            </select>
          </label>
        </div>
        <div className="grid4">
          <label>Prot. (g)<input inputMode="decimal" value={f.protein} onChange={set('protein')} /></label>
          <label>Gluc. (g)<input inputMode="decimal" value={f.carbs} onChange={set('carbs')} /></label>
          <label>Lip. (g)<input inputMode="decimal" value={f.fat} onChange={set('fat')} /></label>
          <label>Kcal<input inputMode="decimal" value={f.kcal} onChange={set('kcal')} placeholder={String(Math.round(theo))} /></label>
        </div>
        <p className={gap ? 'note warn' : 'muted small'}>
          Valeurs {per}. Kcal théoriques d'après les macros : {Math.round(theo)}
          {gap && ' (écart important, vérifie les valeurs)'}
        </p>
        <label>Code-barres<input inputMode="numeric" value={f.barcode} onChange={set('barcode')} /></label>

        <div className="row end">
          {initial.id && (
            <button
              type="button"
              className="danger"
              onClick={() => {
                if (confirm(`Supprimer « ${f.name} » ?`)) {
                  deleteFood(initial.id!)
                  onClose()
                }
              }}
            >
              Supprimer
            </button>
          )}
          <button type="submit">Enregistrer</button>
        </div>
      </form>
      {scan && <Scanner onResult={fromBarcode} onClose={() => setScan(false)} />}
    </div>
  )
}
