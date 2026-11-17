/** Open Food Facts : recherche d'un produit par code-barres ou par nom (base publique et gratuite). */
export interface OffProduct {
  name: string
  brand: string | null
  unit: 'g' | 'ml'
  protein: number
  carbs: number
  fat: number
  kcal: number
  diet: 'vege' | 'vegan' | null
}

/** Résultat d'une recherche par nom : un produit avec son code-barres. */
export interface OffHit extends OffProduct {
  barcode: string
}

/** Open Food Facts déduit vegan / végétarien de la liste d'ingrédients (en:vegan, en:vegetarian…). */
function dietFrom(tags: unknown): OffProduct['diet'] {
  const t = Array.isArray(tags) ? (tags as string[]) : []
  if (t.includes('en:vegan')) return 'vegan'
  if (t.includes('en:vegetarian')) return 'vege'
  return null
}

const n = (v: unknown) => {
  const x = typeof v === 'string' ? parseFloat(v) : (v as number)
  return Number.isFinite(x) ? Math.round(x * 100) / 100 : 0
}

const FIELDS = 'code,product_name,product_name_fr,brands,nutriments,quantity,ingredients_analysis_tags'

/** Convertit un produit Open Food Facts au format des aliments de l'appli (valeurs pour 100 g / 100 ml). */
export function parseOff(p: Record<string, unknown>, code = ''): OffProduct {
  const nu = (p.nutriments ?? {}) as Record<string, unknown>
  let kcal = n(nu['energy-kcal_100g'])
  if (!kcal && nu['energy_100g']) kcal = Math.round(n(nu['energy_100g']) / 4.184)
  return {
    name: String(p.product_name_fr || p.product_name || `Produit ${code}`).trim(),
    // brands est un texte « A, B » (API produit) ou une liste (moteur de recherche).
    brand: (Array.isArray(p.brands) ? String(p.brands[0] ?? '') : String(p.brands ?? '').split(',')[0]).trim() || null,
    unit: /\bml\b|\bcl\b|\bl\b/i.test(String(p.quantity ?? '')) ? 'ml' : 'g',
    protein: n(nu.proteins_100g),
    carbs: n(nu.carbohydrates_100g),
    fat: n(nu.fat_100g),
    kcal,
    diet: dietFrom(p.ingredients_analysis_tags),
  }
}

export async function lookupBarcode(code: string): Promise<OffProduct | null> {
  const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=${FIELDS}`)
  if (!res.ok) return null
  const json = await res.json()
  if (json.status !== 1 || !json.product) return null
  return parseOff(json.product, code)
}

/** Garde les produits qui ont un nom et des valeurs nutritionnelles, sans doublon. */
function toHits(products: Record<string, unknown>[]): OffHit[] {
  const seen = new Set<string>()
  const out: OffHit[] = []
  for (const p of products) {
    const barcode = String(p.code ?? '')
    if (!barcode || seen.has(barcode) || (!p.product_name_fr && !p.product_name)) continue
    const hit = { ...parseOff(p, barcode), barcode }
    if (!hit.kcal && !hit.protein && !hit.carbs && !hit.fat) continue
    seen.add(barcode)
    out.push(hit)
  }
  return out
}

/**
 * Recherche par nom dans Open Food Facts.
 * Le moteur de recherche d'Open Food Facts refuse les appels directs depuis un navigateur (CORS) :
 * on passe par la fonction Supabase « ai » (action food_search, sans IA ni clé API) quand on est connecté,
 * sinon on tente l'ancienne recherche publique d'Open Food Facts.
 */
export async function searchOff(q: string, signal?: AbortSignal): Promise<OffHit[]> {
  let proxyErr: unknown
  try {
    const { callAi } = await import('./ai')
    const res = await callAi<{ hits: Record<string, unknown>[] }>({ action: 'food_search', q })
    return toHits(res.hits ?? [])
  } catch (e) {
    proxyErr = e
  }
  if (signal?.aborted) return []
  try {
    const params = new URLSearchParams({ search_terms: q, search_simple: '1', action: 'process', json: '1', page_size: '24', fields: FIELDS, lc: 'fr' })
    const res = await fetch(`https://world.openfoodfacts.org/cgi/search.pl?${params}`, { signal })
    if (!res.ok) throw new Error(`Open Food Facts : erreur ${res.status}`)
    const json = (await res.json()) as { products?: Record<string, unknown>[] }
    return toHits(json.products ?? [])
  } catch {
    const msg = proxyErr instanceof Error ? proxyErr.message : ''
    throw new Error(
      /Connecte-toi|Configure Supabase/.test(msg)
        ? 'Connecte-toi (Mes réglages) pour chercher dans la base publique Open Food Facts.'
        : `Base publique indisponible pour le moment.${msg ? ' ' + msg : ''}`,
    )
  }
}
