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
}

export type AiRequest = AnalyzeRequest | CoachRequest

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
    return { action: 'coach', messages, context: str(b.context ?? '', 12000, 'context') }
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

export async function coach(client: Anthropic, model: string, req: CoachRequest): Promise<{ reply: string }> {
  const msg = await client.beta.messages.create({
    ...fallback(model),
    model,
    max_tokens: 16000,
    system: `${COACH_SYSTEM}\n\n<donnees>\n${req.context}\n</donnees>`,
    output_config: { effort: 'low' },
    messages: req.messages,
  })
  checkStop(msg)
  return { reply: textOf(msg).trim() }
}

export function run(client: Anthropic, model: string, req: AiRequest) {
  return req.action === 'analyze' ? analyze(client, model, req) : coach(client, model, req)
}
