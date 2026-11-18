import { useState } from 'react'
import { deleteFood, newId, saveFood } from '../lib/store'
import { lookupBarcode } from '../lib/off'
import { MICROS, type MicroKey } from '../lib/micros'
import type { Diet, Food, Unit } from '../lib/types'
import { LazyScanner as Scanner } from './LazyScanner'
import { TabIcon } from './Icons'

export type FoodDraft = Partial<Omit<Food, 'updated_at'>>

interface Props {
  initial: FoodDraft
  onClose: (saved?: Food) => void
}

const num = (s: string) => {
  const x = parseFloat(s.replace(',', '.'))
  return Number.isFinite(x) ? x : 0
}

/** Champ facultatif : vide = inconnu (null), pas zéro. */
const optNum = (s: string) => {
  if (!s.trim()) return null
  const x = parseFloat(s.replace(',', '.'))
  return Number.isFinite(x) ? x : null
}

const optStr = (v: number | null | undefined) => (typeof v === 'number' ? String(v) : '')

function microStrings(src: Partial<Record<MicroKey, number | null>>): Record<MicroKey, string> {
  return Object.fromEntries(MICROS.map(({ key }) => [key, optStr(src[key])])) as Record<MicroKey, string>
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
    diet: (initial.diet ?? '') as Diet | '',
  })
  const [micros, setMicros] = useState(() => microStrings(initial))
  const [showMicros, setShowMicros] = useState(() => MICROS.some(({ key }) => typeof initial[key] === 'number'))
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
        diet: p.diet ?? x.diet,
      }))
      setMicros(microStrings(p))
      if (MICROS.some(({ key }) => p[key] !== null)) setShowMicros(true)
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
      diet: f.diet || null,
      ...(Object.fromEntries(MICROS.map(({ key }) => [key, optNum(micros[key])])) as Record<MicroKey, number | null>),
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
          <TabIcon id="scan" size={18} /> Scanner le code-barres
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
        <details className="micros" open={showMicros} onToggle={(e) => setShowMicros((e.target as HTMLDetailsElement).open)}>
          <summary>Micronutriments (facultatif)</summary>
          <div className="grid3">
            {MICROS.map(({ key, label, unit }) => (
              <label key={key}>
                {label} ({unit})
                <input inputMode="decimal" value={micros[key]} onChange={(e) => setMicros({ ...micros, [key]: e.target.value })} placeholder="?" />
              </label>
            ))}
          </div>
          <p className="muted small">Valeurs {per}. Laisse vide si tu ne sais pas : une case vide compte comme inconnue, pas comme zéro.</p>
        </details>
        <label>
          Régime
          <select value={f.diet} onChange={set('diet')}>
            <option value="">Viande, poisson ou non renseigné</option>
            <option value="vege">Végé (végétarien : œufs, lait possibles)</option>
            <option value="vegan">Vegan (aucun produit animal)</option>
          </select>
        </label>
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
