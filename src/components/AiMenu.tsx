import { useMemo, useState } from 'react'
import { draftMenu, prepareImage, type MenuDraft, type MenuDraftItem } from '../lib/ai'
import { foodsForMenu, photoContext } from '../lib/aiContext'
import { macrosFor, portionsOf, scaleMacros, sum } from '../lib/calc'
import { iso } from '../lib/date'
import { dayMeals, getState, mealTime, newId, saveEntry, saveFood, saveMenu, setMealTime, useStore } from '../lib/store'
import { mealLabel, type CoachProposal, type Food, type Macros, type Meal, type ProposalItem } from '../lib/types'
import { MacroLine } from './Menus'
import { TabIcon } from './Icons'

const r = (x: number) => Math.round(x)
const num = (s: string) => {
  const n = parseFloat(s.replace(',', '.'))
  return Number.isFinite(n) && n >= 0 ? n : 0
}
const fmtDate = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })

/** Marque des aliments créés à partir d'une proposition de l'IA (valeurs estimées). */
export const AI_BRAND = 'Estimation IA'

type Image = Awaited<ReturnType<typeof prepareImage>>
type Estimate = { qty: number; kcal: number; protein: number; carbs: number; fat: number }

/** Une ligne en cours de relecture : un aliment de Mes aliments (food_id), ou un nouvel aliment estimé. */
interface Line extends ProposalItem {
  /** Estimation d'origine de l'IA, pour recalculer les macros quand la quantité change. */
  est: Estimate
}

/** Ingrédients renvoyés par l'IA (ref = numéro dans la liste envoyée) → aliments de Mes aliments ou nouveaux aliments. */
export function resolveItems(items: MenuDraftItem[], ids: string[], foods: Record<string, Food>): ProposalItem[] {
  return items.map(({ ref, ...it }) => {
    const id = ref > 0 ? ids[ref - 1] : undefined
    const f = id ? foods[id] : undefined
    // Aliment reconnu : on garde son unité ; si l'IA en a donné une autre, on repasse en estimation.
    return { ...it, food_id: f && !f.deleted && f.unit === it.unit ? f.id : null }
  })
}

const toLines = (items: ProposalItem[]): Line[] =>
  items.map((it) => ({ ...it, est: { qty: it.qty, kcal: it.kcal, protein: it.protein, carbs: it.carbs, fat: it.fat } }))

/** Macros d'une ligne : celles de l'aliment enregistré, sinon l'estimation de l'IA ramenée à la quantité. */
function lineMacros(l: Line, foods: Record<string, Food>): Macros {
  const f = l.food_id ? foods[l.food_id] : null
  if (f) return macrosFor(f, l.qty)
  const o = l.est
  const k = o.qty > 0 ? l.qty / o.qty : 0
  return { kcal: o.kcal * k, protein: o.protein * k, carbs: o.carbs * k, fat: o.fat * k }
}

/** Valeurs pour 100 g / 100 ml (ou pour 1 unité) d'un ingrédient estimé. */
function perBase(o: Estimate, unit: ProposalItem['unit']) {
  const k = o.qty > 0 ? (unit === 'u' ? 1 / o.qty : 100 / o.qty) : 0
  const x = (v: number) => Math.round(v * k * 10) / 10
  return { kcal: x(o.kcal), protein: x(o.protein), carbs: x(o.carbs), fat: x(o.fat) }
}

/**
 * Menu ou repas proposé par l'IA, modifiable avant d'être enregistré :
 * - sans `proposal` : création d'un menu à partir d'une demande écrite et/ou d'une image ;
 * - avec `proposal` (outil du coach) : relecture d'un menu, ou d'un repas à ajouter au journal.
 * Les ingrédients reconnus dans Mes aliments sont repris tels quels ; les autres deviennent de nouveaux aliments.
 */
export function AiMenu({
  initialPrompt = '',
  proposal,
  onClose,
}: {
  initialPrompt?: string
  /** Proposition du coach à relire (on arrive directement sur la relecture). */
  proposal?: CoachProposal
  /** Appelé avec un message de confirmation une fois enregistré, sans rien si on ferme. */
  onClose: (done?: string) => void
}) {
  const foods = useStore((s) => s.foods)
  const journal = proposal?.kind === 'journal'
  const [prompt, setPrompt] = useState(initialPrompt)
  const [image, setImage] = useState<Image | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [draft, setDraft] = useState<Pick<MenuDraft, 'comment'> | null>(proposal ? { comment: proposal.comment ?? '' } : null)
  const [name, setName] = useState(proposal?.name ?? '')
  const [portionsTxt, setPortionsTxt] = useState(String(proposal?.portions ?? 1))
  const [lines, setLines] = useState<Line[]>(() => (proposal ? toLines(proposal.items) : []))
  const [date, setDate] = useState(proposal?.date ?? iso(new Date()))
  const [meal, setMeal] = useState<Meal>(proposal?.meal ?? 1)
  const [time, setTime] = useState(proposal?.time ?? '')
  const dayList = useStore((s) => dayMeals(s, date), [date])
  const mealChoices = Array.from(new Set([...dayList, dayList.length + 1, meal])).sort((a, b) => a - b)
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
      setDraft(d)
      setName(d.name)
      setPortionsTxt(String(d.portions))
      setLines(toLines(resolveItems(d.items, list.ids, s.foods)))
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
    if ((!journal && !name.trim()) || !valid.length) return
    const items = valid.map((l) => {
      if (l.food_id && foods[l.food_id]) return { food_id: l.food_id, qty: l.qty }
      const f = saveFood({ id: newId(), name: l.name.trim(), unit: l.unit, ...perBase(l.est, l.unit), brand: AI_BRAND, barcode: null, diet: null })
      return { food_id: f.id, qty: l.qty }
    })
    if (journal) {
      for (const it of items) saveEntry({ id: newId(), date, meal, food_id: it.food_id, qty: it.qty })
      // L'heure n'écrase pas celle déjà notée pour ce repas.
      if (time && !mealTime(getState(), date, meal)) setMealTime(date, meal, time)
      onClose(`Ajouté au ${mealLabel(meal).toLowerCase()} du ${fmtDate(date)}${time ? ` à ${time}` : ''} (${r(total.kcal)} kcal).`)
      return
    }
    const m = saveMenu({ id: newId(), name: name.trim(), items, portions })
    onClose(`Menu « ${m.name} » enregistré dans Mes menus.`)
  }

  const title = journal ? `Ajouter au journal : ${name}` : proposal ? 'Menu proposé par le coach' : "Créer un menu avec l'IA"

  return (
    <div className="modal" role="dialog" aria-label={title}>
      <div className="sheet">
        <div className="sheet-head">
          <h2>{title}</h2>
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
            {journal ? (
              <div className="grid2">
                <label>
                  Jour
                  <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
                </label>
                <label>
                  Repas
                  <select value={meal} onChange={(e) => setMeal(Number(e.target.value))}>
                    {mealChoices.map((m) => (
                      <option key={m} value={m}>
                        {mealLabel(m)}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Heure (facultatif)
                  <input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
                </label>
              </div>
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
              </>
            )}
            <ul className="list compact ai-items">
              {lines.map((l, i) => (
                <li key={i}>
                  {l.food_id && foods[l.food_id] ? (
                    <span className="ai-name">{foods[l.food_id].name}</span>
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
                    {l.food_id ? <span className="badge src-mine">Mes aliments</span> : <span className="badge src-new">Nouvel aliment (estimé)</span>} P{' '}
                    {r(macros[i]?.protein ?? 0)} · G {r(macros[i]?.carbs ?? 0)} · L {r(macros[i]?.fat ?? 0)}
                  </span>
                </li>
              ))}
            </ul>
            <div className="menu-total">
              <span>{!journal && portions > 1 ? `À cuisiner (${portions} repas)` : 'Total'}</span>
              <MacroLine m={total} />
            </div>
            {!journal && portions > 1 && (
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
            {lines.some((l) => !l.food_id) && (
              <p className="muted small">Les nouveaux aliments seront ajoutés à Mes aliments (marque « {AI_BRAND} »), avec des valeurs estimées à vérifier.</p>
            )}
            <div className="row end">
              {!proposal && (
                <button className="ghost" onClick={() => setDraft(null)}>
                  Modifier la demande
                </button>
              )}
              <button onClick={save} disabled={(!journal && !name.trim()) || !lines.some((l) => l.name.trim() && l.qty > 0)}>
                {journal ? 'Ajouter au journal' : 'Enregistrer le menu'}
              </button>
            </div>
          </>
        )}
        {err && <p className="note warn">{err}</p>}
      </div>
    </div>
  )
}
