/**
 * Logique de la fonction « ai » (photo de plat + coach), sans dépendance à Deno :
 * le client Anthropic est fourni par index.ts, ce qui permet de vérifier ce fichier avec tsc.
 */
import type Anthropic from '@anthropic-ai/sdk'

/** Haiku 5.5 : environ 40 fois moins cher qu'Opus 5.5, suffisant pour la photo et le coach. */
export const DEFAULT_MODEL = 'claude-haiku-5-5'
/** Taille max d'une image envoyée (en caractères base64, ~4,5 Mo). L'appli redimensionne avant. */
export const MAX_IMAGE_B64 = 6_000_000

const MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const
type MediaType = (typeof MEDIA_TYPES)[number]

export interface AnalyzeRequest {
  action: 'analyze'
  image: string // base64 sans préfixe data:
  mediaType: MediaType
  note?: string
  context?: string // objectifs et reste du jour, préparé par l'appli
}

export interface CoachMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface CoachRequest {
  action: 'coach'
  messages: CoachMessage[]
  context: string
  /** Aliments enregistrés, une ligne « [n] nom – kcal / 100 g » (pour les outils du coach). */
  foods?: string
}

/**
 * Proposition faite par le coach avec un de ses outils : un repas à ajouter au journal, ou un menu à enregistrer.
 * Rien n'est écrit côté serveur : l'appli montre la proposition et la personne la confirme (ou la modifie).
 */
export interface CoachProposal {
  kind: 'journal' | 'menu'
  name: string
  date?: string // journal : AAAA-MM-JJ
  meal?: number // journal : numéro du repas (1, 2…)
  portions?: number // menu : batch cooking
  items: MenuDraftItem[]
  comment: string
}

/** Création d'un menu à partir d'une demande écrite et/ou d'une image (recette, carte, plat, liste de courses). */
export interface MenuRequest {
  action: 'menu'
  prompt: string
  image?: string // base64 sans préfixe data:
  mediaType?: MediaType
  context: string // objectifs de la personne
  foods: string // ses aliments enregistrés, une ligne « [n] nom – kcal / 100 g »
}

export type AiRequest = AnalyzeRequest | CoachRequest | MenuRequest

export interface MenuDraftItem {
  name: string
  /** Numéro de l'aliment dans la liste de la personne (0 = aliment absent de sa liste). */
  ref: number
  qty: number
  unit: 'g' | 'ml' | 'u'
  kcal: number
  protein: number
  carbs: number
  fat: number
}

export interface MenuDraft {
  name: string
  portions: number
  items: MenuDraftItem[]
  comment: string
}

export interface AnalyzedItem {
  name: string
  grams: number
  kcal: number
  protein: number
  carbs: number
  fat: number
}

export interface Analysis {
  dish: string
  items: AnalyzedItem[]
  confidence: 'faible' | 'moyenne' | 'bonne'
  comment: string
}

export class BadRequest extends Error {}

const ANALYSIS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['dish', 'items', 'confidence', 'comment'],
  properties: {
    dish: { type: 'string', description: 'Nom court du plat, en français.' },
    items: {
      type: 'array',
      description: 'Chaque composant visible du plat, avec ses valeurs pour la quantité estimée (pas pour 100 g).',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'grams', 'kcal', 'protein', 'carbs', 'fat'],
        properties: {
          name: { type: 'string', description: 'Aliment, en français (ex. « Riz basmati cuit »).' },
          grams: { type: 'number', description: 'Poids estimé de la portion, en grammes.' },
          kcal: { type: 'number' },
          protein: { type: 'number', description: 'Protéines en g pour cette portion.' },
          carbs: { type: 'number', description: 'Glucides en g pour cette portion.' },
          fat: { type: 'number', description: 'Lipides en g pour cette portion.' },
        },
      },
    },
    confidence: { type: 'string', enum: ['faible', 'moyenne', 'bonne'] },
    comment: {
      type: 'string',
      description: "Avis bref (2 à 4 phrases) sur le plat par rapport à l'objectif de la personne, avec un conseil concret.",
    },
  },
} as const

const MENU_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['name', 'portions', 'items', 'comment'],
  properties: {
    name: { type: 'string', description: 'Nom court du menu, en français (ex. « Bowl poulet riz brocolis »).' },
    portions: { type: 'integer', description: 'Nombre de repas que donnent ces quantités (1 sauf batch cooking).' },
    items: {
      type: 'array',
      description: 'Ingrédients du menu, avec la quantité totale à cuisiner pour toutes les portions.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'ref', 'qty', 'unit', 'kcal', 'protein', 'carbs', 'fat'],
        properties: {
          name: { type: 'string', description: 'Ingrédient, en français (ex. « Riz basmati cru »).' },
          ref: { type: 'integer', description: "Numéro [n] de l'aliment dans la liste de la personne s'il correspond, sinon 0." },
          qty: { type: 'number', description: "Quantité, dans l'unité indiquée." },
          unit: { type: 'string', enum: ['g', 'ml', 'u'], description: "Celle de l'aliment de la liste s'il y en a un ; « u » = unité (œuf, tranche…)." },
          kcal: { type: 'number', description: 'kcal pour cette quantité (pas pour 100 g).' },
          protein: { type: 'number', description: 'Protéines en g pour cette quantité.' },
          carbs: { type: 'number', description: 'Glucides en g pour cette quantité.' },
          fat: { type: 'number', description: 'Lipides en g pour cette quantité.' },
        },
      },
    },
    comment: { type: 'string', description: "Une à trois phrases : pourquoi ce menu colle à l'objectif, ou ce qu'il faut vérifier." },
  },
} as const

const ITEMS_SCHEMA = MENU_SCHEMA.properties.items

/** Outils du coach : il propose, la personne confirme dans l'appli. */
const COACH_TOOLS = [
  {
    name: 'proposer_repas_journal',
    description:
      "Propose d'ajouter un repas (des aliments et leurs quantités) au journal de la personne, à une date et un numéro de repas. " +
      "Utilise cet outil dès qu'elle te demande de noter, d'enregistrer ou d'ajouter ce qu'elle a mangé ou va manger. " +
      "Elle verra la proposition, pourra la corriger, et devra la confirmer : rien n'est écrit sans son accord.",
    input_schema: {
      type: 'object',
      additionalProperties: false,
      required: ['date', 'meal', 'name', 'items', 'comment'],
      properties: {
        date: { type: 'string', description: 'Date AAAA-MM-JJ (celle du jour si elle ne précise pas).' },
        meal: { type: 'integer', description: 'Numéro du repas dans la journée : 1, 2, 3… (prends le prochain repas vide si elle ne précise pas).' },
        name: { type: 'string', description: 'Titre court du repas.' },
        items: { ...ITEMS_SCHEMA, description: 'Aliments du repas avec la quantité mangée.' },
        comment: { type: 'string', description: 'Une phrase facultative (peut être vide).' },
      },
    },
  },
  {
    name: 'proposer_menu',
    description:
      "Propose d'enregistrer un menu réutilisable dans « Mes menus » (une recette ou un repas type, éventuellement en batch cooking). " +
      'Utilise cet outil quand elle te demande de créer, sauvegarder ou composer un menu. Elle confirmera avant enregistrement.',
    input_schema: {
      type: 'object',
      additionalProperties: false,
      required: ['name', 'portions', 'items', 'comment'],
      properties: {
        name: MENU_SCHEMA.properties.name,
        portions: MENU_SCHEMA.properties.portions,
        items: ITEMS_SCHEMA,
        comment: MENU_SCHEMA.properties.comment,
      },
    },
  },
] as const

const MENU_SYSTEM = `Tu composes des menus (repas) pour une appli de suivi des calories et des macros. Réponds en français, tutoiement.
La personne décrit ce qu'elle veut (texte) et/ou envoie une image : recette, plat, carte de restaurant, liste de courses, contenu du frigo…
Propose UN menu réaliste avec ses ingrédients et leurs quantités en grammes (ou ml, ou unités pour les œufs, tranches…).
Utilise en priorité les aliments de SA liste : si un ingrédient y correspond, mets son numéro dans ref et utilise son unité. Sinon ref = 0 et estime les valeurs avec des références type Ciqual.
Indique les quantités crues ou cuites comme le nom de l'aliment l'indique. Compte l'huile de cuisson et les sauces.
Si la personne ne précise pas de quantité, adapte les portions à son objectif (un repas, pas la journée entière). Si elle parle de batch cooking ou de plusieurs repas, mets le nombre de portions et les quantités totales.`

const ANALYZE_SYSTEM = `Tu es un nutritionniste qui estime le contenu d'un repas à partir d'une photo, pour une appli de suivi des calories et des macros.
Décompose le plat en composants (féculent, protéine, légumes, sauce, matière grasse de cuisson, boisson…). Pour chacun, estime le poids de la portion visible en grammes, puis les kcal, protéines, glucides et lipides de cette portion, en t'appuyant sur des valeurs nutritionnelles de référence (type Ciqual).
Repère l'échelle avec l'assiette, les couverts ou l'emballage. Compte l'huile et les sauces même peu visibles, elles sont souvent sous-estimées.
Si la photo montre une carte de restaurant ou un menu plutôt qu'une assiette, estime une portion de restaurant typique du plat que la note désigne (ou du plat principal visible).
Si la photo ne montre pas de nourriture, renvoie une liste vide et explique-le dans le commentaire.
Indique une confiance « faible » si la quantité ou la composition est difficile à juger.
Réponds en français, tutoiement.`

const COACH_SYSTEM = `Tu es le coach nutrition de l'appli Kcalculator. Tu tutoies la personne et tu réponds en français.
Tu t'appuies sur ses données réelles (fournies ci-dessous) : objectif, cibles caloriques et macros, journal des derniers jours.
Sois concret et bref : quelques phrases ou une courte liste, avec des chiffres tirés de ses données quand c'est utile. Tu peux mettre en forme en Markdown simple (gras, listes, titres courts), sans tableau. Propose des ajustements réalistes (aliments, portions, timing), sans culpabiliser.
Un écart ponctuel (cheat meal) n'annule pas une semaine régulière : replace-le dans la moyenne de la semaine.
Tu as deux outils pour agir dans l'appli : proposer_repas_journal (noter un repas dans son journal) et proposer_menu (enregistrer un menu). Quand elle te demande d'ajouter, noter, enregistrer ou créer un repas ou un menu, utilise l'outil au lieu de lui dire de le faire elle-même. Utilise en priorité ses aliments enregistrés (numéro [n] dans ref, avec leur unité) ; sinon ref = 0 et estime les valeurs (références type Ciqual). Accompagne l'outil d'une phrase courte ; elle confirmera dans l'appli.
Tu n'es pas médecin : pour un problème de santé, une grossesse, un trouble du comportement alimentaire ou un régime très restrictif, recommande un professionnel de santé.`

function str(v: unknown, max: number, field: string): string {
  if (typeof v !== 'string') throw new BadRequest(`Champ ${field} manquant`)
  return v.slice(0, max)
}

/** Vérifie la requête envoyée par l'appli. */
export function parseRequest(body: unknown): AiRequest {
  const b = (body ?? {}) as Record<string, unknown>
  if (b.action === 'analyze') {
    const image = str(b.image, MAX_IMAGE_B64 + 1, 'image')
    if (image.length > MAX_IMAGE_B64) throw new BadRequest('Image trop lourde')
    if (!MEDIA_TYPES.includes(b.mediaType as MediaType)) throw new BadRequest("Format d'image non pris en charge")
    return {
      action: 'analyze',
      image,
      mediaType: b.mediaType as MediaType,
      note: typeof b.note === 'string' ? b.note.slice(0, 500) : undefined,
      context: typeof b.context === 'string' ? b.context.slice(0, 4000) : undefined,
    }
  }
  if (b.action === 'coach') {
    if (!Array.isArray(b.messages) || b.messages.length === 0) throw new BadRequest('Aucun message')
    const messages = (b.messages as unknown[]).slice(-20).map((m, i) => {
      const x = (m ?? {}) as Record<string, unknown>
      if (x.role !== 'user' && x.role !== 'assistant') throw new BadRequest(`Message ${i} invalide`)
      return { role: x.role, content: str(x.content, 4000, 'content') } as CoachMessage
    })
    // L'API attend une conversation qui commence et se termine par l'utilisateur.
    while (messages.length && messages[0].role !== 'user') messages.shift()
    if (!messages.length || messages[messages.length - 1].role !== 'user') throw new BadRequest('Le dernier message doit venir de toi')
    return {
      action: 'coach',
      messages,
      context: str(b.context ?? '', 12000, 'context'),
      ...(typeof b.foods === 'string' && b.foods ? { foods: b.foods.slice(0, 40000) } : {}),
    }
  }
  if (b.action === 'menu') {
    const prompt = typeof b.prompt === 'string' ? b.prompt.slice(0, 2000) : ''
    let image: string | undefined
    let mediaType: MediaType | undefined
    if (b.image != null) {
      image = str(b.image, MAX_IMAGE_B64 + 1, 'image')
      if (image.length > MAX_IMAGE_B64) throw new BadRequest('Image trop lourde')
      if (!MEDIA_TYPES.includes(b.mediaType as MediaType)) throw new BadRequest("Format d'image non pris en charge")
      mediaType = b.mediaType as MediaType
    }
    if (!prompt.trim() && !image) throw new BadRequest('Décris le menu voulu ou ajoute une image')
    return {
      action: 'menu',
      prompt,
      image,
      mediaType,
      context: typeof b.context === 'string' ? b.context.slice(0, 4000) : '',
      foods: typeof b.foods === 'string' ? b.foods.slice(0, 40000) : '',
    }
  }
  throw new BadRequest('Action inconnue')
}

const round1 = (x: unknown) => {
  const n = typeof x === 'number' ? x : Number(x)
  return Number.isFinite(n) && n > 0 ? Math.round(n * 10) / 10 : 0
}

/** Nettoie la réponse du modèle (valeurs négatives, éléments vides). */
export function cleanAnalysis(raw: unknown): Analysis {
  const a = (raw ?? {}) as Partial<Analysis>
  const items = (Array.isArray(a.items) ? a.items : [])
    .map((it) => ({
      name: String(it?.name ?? '').trim().slice(0, 80),
      grams: round1(it?.grams),
      kcal: round1(it?.kcal),
      protein: round1(it?.protein),
      carbs: round1(it?.carbs),
      fat: round1(it?.fat),
    }))
    .filter((it) => it.name && it.grams > 0)
  const confidence = a.confidence === 'bonne' || a.confidence === 'moyenne' ? a.confidence : 'faible'
  return { dish: String(a.dish ?? 'Plat').trim().slice(0, 80) || 'Plat', items, confidence, comment: String(a.comment ?? '').trim() }
}

/** Nettoie le menu proposé par le modèle. `maxRef` = nombre d'aliments dans la liste envoyée. */
export function cleanMenu(raw: unknown, maxRef: number): MenuDraft {
  const m = (raw ?? {}) as Partial<MenuDraft>
  const items = (Array.isArray(m.items) ? m.items : [])
    .map((it) => {
      const ref = Math.round(Number(it?.ref))
      return {
        name: String(it?.name ?? '').trim().slice(0, 80),
        ref: Number.isFinite(ref) && ref >= 1 && ref <= maxRef ? ref : 0,
        qty: round1(it?.qty),
        unit: it?.unit === 'ml' || it?.unit === 'u' ? it.unit : 'g',
        kcal: round1(it?.kcal),
        protein: round1(it?.protein),
        carbs: round1(it?.carbs),
        fat: round1(it?.fat),
      } as MenuDraftItem
    })
    .filter((it) => it.name && it.qty > 0)
  const portions = Math.min(30, Math.max(1, Math.round(Number(m.portions)) || 1))
  return { name: String(m.name ?? 'Menu').trim().slice(0, 80) || 'Menu', portions, items, comment: String(m.comment ?? '').trim() }
}

/** Nettoie une proposition faite avec un outil du coach. Renvoie null si elle est inutilisable. */
export function cleanProposal(name: string, input: unknown, maxRef: number, today: string): CoachProposal | null {
  const x = (input ?? {}) as Record<string, unknown>
  if (name !== 'proposer_repas_journal' && name !== 'proposer_menu') return null
  const m = cleanMenu({ name: x.name, portions: x.portions, items: x.items, comment: x.comment }, maxRef)
  if (!m.items.length) return null
  if (name === 'proposer_menu') return { kind: 'menu', name: m.name, portions: m.portions, items: m.items, comment: m.comment }
  const date = typeof x.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x.date) ? x.date : today
  const meal = Math.min(12, Math.max(1, Math.round(Number(x.meal)) || 1))
  return { kind: 'journal', name: m.name, date, meal, items: m.items, comment: m.comment }
}

function textOf(msg: Anthropic.Beta.BetaMessage) {
  return msg.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')
}

export class Refused extends Error {}

function checkStop(msg: Anthropic.Beta.BetaMessage) {
  if (msg.stop_reason === 'refusal') throw new Refused("L'IA a refusé de répondre à cette demande.")
}

/** Repli automatique sur un autre modèle si le modèle principal décline la demande (pas proposé pour Haiku). */
export const fallback = (model: string) =>
  model.startsWith('claude-haiku') ? {} : { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const }

export async function analyze(client: Anthropic, model: string, req: AnalyzeRequest): Promise<Analysis> {
  const text = [
    req.note ? `Précision de la personne : ${req.note}` : 'Pas de précision de la personne.',
    req.context ? `Son contexte du jour :\n${req.context}` : '',
  ]
    .filter(Boolean)
    .join('\n\n')
  const msg = await client.beta.messages.create({
    ...fallback(model),
    model,
    max_tokens: 16000,
    system: ANALYZE_SYSTEM,
    output_config: { effort: 'medium', format: { type: 'json_schema', schema: ANALYSIS_SCHEMA } },
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: req.mediaType, data: req.image } },
          { type: 'text', text },
        ],
      },
    ],
  })
  checkStop(msg)
  let parsed: unknown
  try {
    parsed = JSON.parse(textOf(msg))
  } catch {
    throw new Error("Réponse de l'IA illisible, réessaie.")
  }
  return cleanAnalysis(parsed)
}

export async function coach(client: Anthropic, model: string, req: CoachRequest): Promise<{ reply: string; proposals: CoachProposal[] }> {
  const foods = req.foods ?? ''
  const maxRef = (foods.match(/^\[\d+\]/gm) ?? []).length
  const today = /Date du jour : (\d{4}-\d{2}-\d{2})/.exec(req.context)?.[1] ?? new Date().toISOString().slice(0, 10)
  const data = foods ? `${req.context}\n\nSes aliments enregistrés (valeurs pour 100 g / 100 ml, ou pour 1 unité si « / u ») :\n${foods}` : req.context
  const msg = await client.beta.messages.create({
    ...fallback(model),
    model,
    max_tokens: 16000,
    system: `${COACH_SYSTEM}\n\n<donnees>\n${data}\n</donnees>`,
    output_config: { effort: 'low' },
    tools: COACH_TOOLS as unknown as Anthropic.Beta.BetaToolUnion[],
    messages: req.messages,
  })
  checkStop(msg)
  const proposals = msg.content
    .filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use')
    .map((b) => cleanProposal(b.name, b.input, maxRef, today))
    .filter((p): p is CoachProposal => p !== null)
  let reply = textOf(msg).trim()
  if (!reply && proposals.length) reply = 'Voici ma proposition, vérifie-la avant de confirmer :'
  return { reply, proposals }
}

export async function menu(client: Anthropic, model: string, req: MenuRequest): Promise<MenuDraft> {
  const maxRef = (req.foods.match(/^\[\d+\]/gm) ?? []).length
  const text = [
    req.prompt.trim() ? `Demande : ${req.prompt.trim()}` : "Demande : compose un menu à partir de l'image.",
    req.context ? `Contexte de la personne :\n${req.context}` : '',
    req.foods
      ? `Ses aliments enregistrés (valeurs pour 100 g / 100 ml, ou pour 1 unité si « / u ») :\n${req.foods}`
      : "Elle n'a aucun aliment enregistré : ref = 0 partout.",
  ]
    .filter(Boolean)
    .join('\n\n')
  const content: Anthropic.Beta.BetaContentBlockParam[] = []
  if (req.image && req.mediaType) content.push({ type: 'image', source: { type: 'base64', media_type: req.mediaType, data: req.image } })
  content.push({ type: 'text', text })
  const msg = await client.beta.messages.create({
    ...fallback(model),
    model,
    max_tokens: 16000,
    system: MENU_SYSTEM,
    output_config: { effort: 'medium', format: { type: 'json_schema', schema: MENU_SCHEMA } },
    messages: [{ role: 'user', content }],
  })
  checkStop(msg)
  let parsed: unknown
  try {
    parsed = JSON.parse(textOf(msg))
  } catch {
    throw new Error("Réponse de l'IA illisible, réessaie.")
  }
  return cleanMenu(parsed, maxRef)
}

export function run(client: Anthropic, model: string, req: AiRequest) {
  if (req.action === 'analyze') return analyze(client, model, req)
  if (req.action === 'menu') return menu(client, model, req)
  return coach(client, model, req)
}

/**
 * Recherche d'aliments par nom dans Open Food Facts (moteur search.openfoodfacts.org).
 * Ce moteur n'autorise pas les appels directs depuis un navigateur (CORS) : la fonction sert de relais.
 * Pas besoin de clé API Anthropic pour cette action.
 */
export const OFF_FIELDS = 'code,product_name,product_name_fr,brands,nutriments,quantity,ingredients_analysis_tags'

export function parseFoodSearch(body: unknown): string {
  const b = (body ?? {}) as Record<string, unknown>
  const q = typeof b.q === 'string' ? b.q.trim().slice(0, 100) : ''
  if (q.length < 2) throw new BadRequest('Recherche trop courte')
  return q
}

export async function searchFoods(q: string, fetchFn: typeof fetch = fetch): Promise<{ hits: unknown[] }> {
  const params = new URLSearchParams({ q, page_size: '24', langs: 'fr', fields: OFF_FIELDS })
  const res = await fetchFn(`https://search.openfoodfacts.org/search?${params}`, {
    headers: { 'User-Agent': 'Kcalculator/1.0 (appli perso de suivi nutritionnel)' },
  })
  if (!res.ok) throw new Error(`Open Food Facts : erreur ${res.status}`)
  const json = (await res.json()) as { hits?: unknown[] }
  return { hits: Array.isArray(json.hits) ? json.hits : [] }
}
