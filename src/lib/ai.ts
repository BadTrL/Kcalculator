import { supabase } from './sync'

/**
 * Appels à l'IA via la fonction Supabase « ai » (supabase/functions/ai).
 * La clé API est un secret de cette fonction : elle n'est jamais dans l'appli.
 */

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

export interface CoachMessage {
  role: 'user' | 'assistant'
  content: string
}

async function callAi<T>(body: Record<string, unknown>): Promise<T> {
  const sb = supabase()
  if (!sb) throw new Error("Configure Supabase dans Réglages pour utiliser l'IA.")
  const { data: auth } = await sb.auth.getSession()
  if (!auth.session) throw new Error("Connecte-toi dans Réglages pour utiliser l'IA.")
  const { data, error } = await sb.functions.invoke('ai', { body })
  if (error) {
    // Le message utile est dans le corps de la réponse de la fonction.
    const ctx = (error as { context?: Response }).context
    let msg = ''
    try {
      msg = ctx ? ((await ctx.json()) as { error?: string }).error ?? '' : ''
    } catch {
      /* corps non JSON */
    }
    if (!msg && ctx?.status === 404) msg = "La fonction IA n'est pas déployée (voir README, section IA)."
    // Fonction absente ou en panne : la réponse n'a pas les en-têtes CORS, le navigateur la bloque
    // et supabase-js ne voit qu'un échec réseau (FunctionsFetchError).
    if (!msg && (error as Error).name === 'FunctionsFetchError') {
      msg = navigator.onLine
        ? "Impossible de joindre la fonction IA : elle n'est sans doute pas déployée (« supabase functions deploy ai », voir README) ou elle plante au démarrage (Supabase > Edge Functions > ai > Logs)."
        : "Pas de connexion internet : l'IA a besoin du réseau."
    }
    throw new Error(msg || error.message)
  }
  return data as T
}

/**
 * Clé API Anthropic du compte (migration 004). L'appli peut l'écrire ou la supprimer,
 * mais ne peut relire que ses 4 derniers caractères : seule la fonction « ai » la déchiffre.
 */
export interface AiKeyStatus {
  hint: string
  updatedAt: string
}

/** null = pas de clé ; 'missing' = migration 004 pas encore lancée. */
export async function getAiKeyStatus(): Promise<AiKeyStatus | null | 'missing'> {
  const sb = supabase()
  if (!sb) return null
  const { data, error } = await sb.from('ai_keys').select('hint, updated_at').maybeSingle()
  if (error) {
    if (error.code === '42P01' || error.code === 'PGRST205' || /ai_keys/.test(error.message)) return 'missing'
    throw new Error(error.message)
  }
  return data ? { hint: data.hint as string, updatedAt: data.updated_at as string } : null
}

export async function saveAiKey(key: string): Promise<string> {
  const sb = supabase()
  if (!sb) throw new Error('Configure Supabase dans Réglages.')
  const { data, error } = await sb.rpc('set_ai_key', { p_key: key.trim() })
  if (error) throw new Error(error.message)
  return data as string
}

export async function deleteAiKey(): Promise<void> {
  const sb = supabase()
  if (!sb) return
  const { error } = await sb.rpc('delete_ai_key')
  if (error) throw new Error(error.message)
}

/** Réduit la photo (1280 px max, JPEG) : envoi plus rapide et moins cher, précision suffisante. */
export async function prepareImage(file: Blob, max = 1280): Promise<{ data: string; mediaType: 'image/jpeg'; preview: string }> {
  const bmp = await createImageBitmap(file)
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bmp.width * k)
  canvas.height = Math.round(bmp.height * k)
  canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height)
  bmp.close()
  const preview = canvas.toDataURL('image/jpeg', 0.85)
  return { data: preview.slice(preview.indexOf(',') + 1), mediaType: 'image/jpeg', preview }
}

export function analyzePhoto(image: { data: string; mediaType: string }, note: string, context: string) {
  return callAi<Analysis>({ action: 'analyze', image: image.data, mediaType: image.mediaType, note, context })
}

export async function askCoach(messages: CoachMessage[], context: string) {
  return (await callAi<{ reply: string }>({ action: 'coach', messages, context })).reply
}

/** Valeurs pour 100 g d'un élément estimé (le format des aliments de l'appli). */
export function per100(it: AnalyzedItem) {
  const k = it.grams > 0 ? 100 / it.grams : 0
  const r = (x: number) => Math.round(x * k * 10) / 10
  return { kcal: r(it.kcal), protein: r(it.protein), carbs: r(it.carbs), fat: r(it.fat) }
}

/** Change le poids d'un élément en gardant sa composition (les macros suivent). */
export function rescale(it: AnalyzedItem, grams: number): AnalyzedItem {
  const k = it.grams > 0 ? grams / it.grams : 0
  const r = (x: number) => Math.round(x * k * 10) / 10
  return { ...it, grams, kcal: r(it.kcal), protein: r(it.protein), carbs: r(it.carbs), fat: r(it.fat) }
}
