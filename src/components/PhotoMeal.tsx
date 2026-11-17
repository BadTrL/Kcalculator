import { useMemo, useState } from 'react'
import { analyzePhoto, per100, prepareImage, rescale, type Analysis, type AnalyzedItem } from '../lib/ai'
import { photoContext } from '../lib/aiContext'
import { sum } from '../lib/calc'
import { getState, newId, saveEntry, saveFood } from '../lib/store'
import { MEALS, type Meal } from '../lib/types'
import { TabIcon } from './Icons'

const r = (x: number) => Math.round(x)
const num = (s: string) => {
  const n = parseFloat(s.replace(',', '.'))
  return Number.isFinite(n) && n >= 0 ? n : 0
}
const PHOTO_BRAND = 'Estimation photo'

type Image = Awaited<ReturnType<typeof prepareImage>>

/**
 * Photo d'un plat → estimation des aliments et macros par l'IA → correction → ajout au journal.
 * Chaque élément devient un aliment (valeurs pour 100 g, marque « Estimation photo ») et une ligne du journal.
 */
export function PhotoMeal({ date, meal: initialMeal, onClose }: { date: string; meal: Meal; onClose: (msg?: string) => void }) {
  const [meal, setMeal] = useState<Meal>(initialMeal)
  const [image, setImage] = useState<Image | null>(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [result, setResult] = useState<Analysis | null>(null)
  const [items, setItems] = useState<AnalyzedItem[]>([])
  const total = useMemo(() => sum(items), [items])

  async function pick(file?: File) {
    if (!file) return
    setErr(null)
    setResult(null)
    try {
      setImage(await prepareImage(file))
    } catch {
      setErr('Impossible de lire cette image.')
    }
  }

  async function run() {
    if (!image) return
    setBusy(true)
    setErr(null)
    try {
      const a = await analyzePhoto(image, note.trim(), photoContext(getState(), date))
      setResult(a)
      setItems(a.items)
      if (!a.items.length) setErr("L'IA n'a reconnu aucun aliment sur la photo.")
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const edit = (i: number, patch: Partial<AnalyzedItem>) => setItems(items.map((it, j) => (j === i ? { ...it, ...patch } : it)))

  function save() {
    const valid = items.filter((it) => it.name.trim() && it.grams > 0)
    for (const it of valid) {
      const food = saveFood({ id: newId(), name: it.name.trim(), unit: 'g', ...per100(it), brand: PHOTO_BRAND, barcode: null, diet: null })
      saveEntry({ id: newId(), date, meal, food_id: food.id, qty: Math.round(it.grams) })
    }
    onClose(`${result?.dish ?? 'Plat'} ajouté à ${meal} (${r(sum(valid).kcal)} kcal, estimation).`)
  }

  return (
    <div className="modal" role="dialog" aria-label="Analyser un plat en photo">
      <div className="sheet">
        <div className="sheet-head">
          <h2>Plat en photo</h2>
          <button className="ghost" onClick={() => onClose()} aria-label="Fermer">✕</button>
        </div>

        {!result && (
          <>
            <label className={`photo-drop${image ? ' has' : ''}`}>
              {image ? <img src={image.preview} alt="Photo du plat" /> : <span><TabIcon id="camera" size={22} /> Prendre ou choisir une photo</span>}
              <input type="file" accept="image/*" capture="environment" hidden onChange={(e) => pick(e.target.files?.[0])} />
            </label>
            <label>
              Précision (facultatif)
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="ex. grande assiette, cuit à l'huile d'olive, sauce à part" />
            </label>
            <label>
              Repas
              <select value={meal} onChange={(e) => setMeal(e.target.value as Meal)}>
                {MEALS.map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </select>
            </label>
            <div className="row end">
              <button onClick={run} disabled={!image || busy}>{busy ? 'Analyse en cours…' : 'Analyser'}</button>
            </div>
          </>
        )}

        {result && (
          <>
            <div className="photo-head">
              {image && <img src={image.preview} alt="" />}
              <div>
                <strong>{result.dish}</strong>
                <span className={`badge conf-${result.confidence}`}>confiance {result.confidence}</span>
              </div>
            </div>
            <p className="note warn small">Estimation approximative à partir d'une photo. Corrige les poids si tu les connais : les macros suivent.</p>
            <ul className="list compact ai-items">
              {items.map((it, i) => (
                <li key={i}>
                  <input aria-label="Aliment" value={it.name} onChange={(e) => edit(i, { name: e.target.value })} />
                  <label className="inline">
                    <input aria-label="Poids en grammes" inputMode="decimal" value={it.grams} onChange={(e) => edit(i, rescale(it, num(e.target.value)))} /> g
                  </label>
                  <span className="small ai-kcal">{r(it.kcal)} kcal</span>
                  <button className="ghost" aria-label={`Retirer ${it.name}`} onClick={() => setItems(items.filter((_, j) => j !== i))}>✕</button>
                  <span className="muted small ai-macros">P {r(it.protein)} · G {r(it.carbs)} · L {r(it.fat)}</span>
                </li>
              ))}
            </ul>
            <div className="menu-total">
              <span>Total</span>
              <span>
                {r(total.kcal)} kcal · P {r(total.protein)} · G {r(total.carbs)} · L {r(total.fat)}
              </span>
            </div>
            {result.comment && (
              <div className="ai-comment">
                <strong>L'avis de l'IA</strong>
                <p>{result.comment}</p>
              </div>
            )}
            <div className="row end">
              <button className="ghost" onClick={() => setResult(null)}>Autre photo</button>
              <button onClick={save} disabled={!items.some((it) => it.name.trim() && it.grams > 0)}>Ajouter à {meal}</button>
            </div>
          </>
        )}
        {err && <p className="note warn">{err}</p>}
      </div>
    </div>
  )
}
