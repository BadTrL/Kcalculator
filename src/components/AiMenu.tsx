import { useMemo, useState } from 'react'
import { draftMenu, prepareImage, type MenuDraft, type MenuDraftItem } from '../lib/ai'
import { foodsForMenu, photoContext } from '../lib/aiContext'
import { macrosFor, portionsOf, scaleMacros, sum } from '../lib/calc'
import { iso } from '../lib/date'
import { getState, newId, saveFood, saveMenu, useStore } from '../lib/store'
import type { Food, Macros, Menu } from '../lib/types'
import { MacroLine } from './Menus'
import { TabIcon } from './Icons'

const r = (x: number) => Math.round(x)
const num = (s: string) => {
  const n = parseFloat(s.replace(',', '.'))
  return Number.isFinite(n) && n >= 0 ? n : 0
}
/** Marque des aliments créés à partir d'un menu proposé par l'IA (valeurs estimées). */
export const AI_BRAND = 'Estimation IA'

type Image = Awaited<ReturnType<typeof prepareImage>>

/** Une ligne du menu en cours de relecture : un aliment de Mes aliments, ou un nouvel aliment estimé. */
interface Line extends MenuDraftItem {
  foodId: string | null
  /** Estimation d'origine de l'IA, pour recalculer les macros quand la quantité change. */
  est: MenuDraftItem
}

/** Macros d'une ligne : celles de l'aliment enregistré, sinon l'estimation de l'IA ramenée à la quantité. */
function lineMacros(l: Line, foods: Record<string, Food>): Macros {
  const f = l.foodId ? foods[l.foodId] : null
  if (f) return macrosFor(f, l.qty)
  const o = l.est
  const k = o.qty > 0 ? l.qty / o.qty : 0
  return { kcal: o.kcal * k, protein: o.protein * k, carbs: o.carbs * k, fat: o.fat * k }
}

/** Valeurs pour 100 g / 100 ml (ou pour 1 unité) d'un ingrédient estimé. */
function perBase(it: MenuDraftItem) {
  const k = it.qty > 0 ? (it.unit === 'u' ? 1 / it.qty : 100 / it.qty) : 0
  const x = (v: number) => Math.round(v * k * 10) / 10
  return { kcal: x(it.kcal), protein: x(it.protein), carbs: x(it.carbs), fat: x(it.fat) }
}

/**
 * Création d'un menu par l'IA à partir d'une demande écrite et/ou d'une image (recette, plat, carte…).
 * Le menu proposé reste modifiable (nom, portions, quantités, ingrédients) avant d'être enregistré.
 * Les ingrédients reconnus dans Mes aliments sont repris tels quels ; les autres deviennent de nouveaux aliments.
 */
export function AiMenu({ initialPrompt = '', onClose }: { initialPrompt?: string; onClose: (saved?: Menu) => void }) {
  const foods = useStore((s) => s.foods)
  const [prompt, setPrompt] = useState(initialPrompt)
  const [image, setImage] = useState<Image | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [draft, setDraft] = useState<MenuDraft | null>(null)
  const [name, setName] = useState('')
  const [portionsTxt, setPortionsTxt] = useState('1')
  const [lines, setLines] = useState<Line[]>([])
  const portions = portionsOf({ portions: parseInt(portionsTxt, 10) })

  const macros = useMemo(() => lines.map((l) => lineMacros(l, foods)), [lines, foods])
  const total = useMemo(() => sum(macros), [macros])

  async function pick(file?: File) {
    if (!file) return
    setErr(null)
    try {
      setImage(await prepareImage(file))
    } catch {
      setErr('Impossible de lire cette image.')
    }
  }

  async function run() {
    if (!prompt.trim() && !image) return
    setBusy(true)
    setErr(null)
    try {
      const s = getState()
      const list = foodsForMenu(s.foods)
      const d = await draftMenu(prompt.trim(), image, photoContext(s, iso(new Date())), list.text)
      if (!d.items.length) throw new Error("L'IA n'a pas proposé d'ingrédient. Précise ta demande.")
      const next = d.items.map((it) => {
        const id = it.ref > 0 ? list.ids[it.ref - 1] : undefined
        const f = id ? s.foods[id] : undefined
        // Aliment reconnu : on garde son unité ; si l'IA en a donné une autre, on repasse en estimation.
        return { ...it, foodId: f && !f.deleted && f.unit === it.unit ? f.id : null, est: it } as Line
      })
      setDraft(d)
      setName(d.name)
      setPortionsTxt(String(d.portions))
      setLines(next)
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  function edit(i: number, patch: Partial<Line>) {
    setLines((xs) => xs.map((l, j) => (j === i ? { ...l, ...patch } : l)))
  }

  function save() {
    const valid = lines.filter((l) => l.name.trim() && l.qty > 0)
    if (!name.trim() || !valid.length) return
    const items = valid.map((l) => {
      if (l.foodId && foods[l.foodId]) return { food_id: l.foodId, qty: l.qty }
      const f = saveFood({ id: newId(), name: l.name.trim(), unit: l.unit, ...perBase(l.est), brand: AI_BRAND, barcode: null, diet: null })
      return { food_id: f.id, qty: l.qty }
    })
    onClose(saveMenu({ id: newId(), name: name.trim(), items, portions }))
  }

  return (
    <div className="modal" role="dialog" aria-label="Créer un menu avec l'IA">
      <div className="sheet">
        <div className="sheet-head">
          <h2>Créer un menu avec l'IA</h2>
          <button className="ghost" onClick={() => onClose()} aria-label="Fermer">✕</button>
        </div>

        {!draft ? (
          <>
            <p className="muted small">
              Décris le repas voulu, ou ajoute une photo (recette, plat, carte de restaurant, contenu du frigo…). L'IA utilise tes aliments en priorité, et tu peux tout corriger avant
              d'enregistrer.
            </p>
            <label>
              Ta demande
              <textarea
                rows={3}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="ex. Petit-déj 600 kcal riche en protéines, ou : batch cooking chili végé pour 4 repas"
              />
            </label>
            <label className={`photo-drop${image ? ' has' : ''}`}>
              {image ? (
                <img src={image.preview} alt="Image jointe" />
              ) : (
                <span>
                  <TabIcon id="image" size={22} /> Ajouter une image (facultatif)
                </span>
              )}
              <input type="file" accept="image/*" hidden onChange={(e) => pick(e.target.files?.[0])} />
            </label>
            {image && (
              <button type="button" className="ghost small" onClick={() => setImage(null)}>
                Retirer l'image
              </button>
            )}
            <div className="row end">
              <button onClick={run} disabled={busy || (!prompt.trim() && !image)}>
                {busy ? 'Création en cours…' : 'Créer le menu'}
              </button>
            </div>
          </>
        ) : (
          <>
            <label>
              Nom du menu
              <input value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <label>
              Batch cooking : préparé pour combien de repas ?
              <input type="number" min={1} max={30} inputMode="numeric" value={portionsTxt} onChange={(e) => setPortionsTxt(e.target.value)} />
            </label>
            <ul className="list compact ai-items">
              {lines.map((l, i) => (
                <li key={i}>
                  {l.foodId && foods[l.foodId] ? (
                    <span className="ai-name">{foods[l.foodId].name}</span>
                  ) : (
                    <input aria-label="Ingrédient" value={l.name} onChange={(e) => edit(i, { name: e.target.value })} />
                  )}
                  <label className="inline">
                    <input aria-label="Quantité" inputMode="decimal" value={l.qty} onChange={(e) => edit(i, { qty: num(e.target.value) })} /> {l.unit}
                  </label>
                  <span className="small ai-kcal">{r(macros[i]?.kcal ?? 0)} kcal</span>
                  <button className="ghost" aria-label={`Retirer ${l.name}`} onClick={() => setLines(lines.filter((_, j) => j !== i))}>
                    ✕
                  </button>
                  <span className="muted small ai-macros">
                    {l.foodId ? <span className="badge src-mine">Mes aliments</span> : <span className="badge src-new">Nouvel aliment (estimé)</span>} P {r(macros[i]?.protein ?? 0)} · G{' '}
                    {r(macros[i]?.carbs ?? 0)} · L {r(macros[i]?.fat ?? 0)}
                  </span>
                </li>
              ))}
            </ul>
            <div className="menu-total">
              <span>{portions > 1 ? `À cuisiner (${portions} repas)` : 'Total'}</span>
              <MacroLine m={total} />
            </div>
            {portions > 1 && (
              <div className="menu-total portion">
                <span>Par repas (1 portion)</span>
                <MacroLine m={scaleMacros(total, 1 / portions)} />
              </div>
            )}
            {draft.comment && (
              <div className="ai-comment">
                <strong>L'avis de l'IA</strong>
                <p>{draft.comment}</p>
              </div>
            )}
            <p className="muted small">Les nouveaux aliments seront ajoutés à Mes aliments (marque « {AI_BRAND} »), avec des valeurs estimées à vérifier.</p>
            <div className="row end">
              <button className="ghost" onClick={() => setDraft(null)}>
                Modifier la demande
              </button>
              <button onClick={save} disabled={!name.trim() || !lines.some((l) => l.name.trim() && l.qty > 0)}>
                Enregistrer le menu
              </button>
            </div>
          </>
        )}
        {err && <p className="note warn">{err}</p>}
      </div>
    </div>
  )
}
