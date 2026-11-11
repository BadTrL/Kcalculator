/** Recherche d'un produit sur Open Food Facts à partir de son code-barres. */
export interface OffProduct {
  name: string
  brand: string | null
  unit: 'g' | 'ml'
  protein: number
  carbs: number
  fat: number
  kcal: number
}

const n = (v: unknown) => {
  const x = typeof v === 'string' ? parseFloat(v) : (v as number)
  return Number.isFinite(x) ? Math.round(x * 100) / 100 : 0
}

export async function lookupBarcode(code: string): Promise<OffProduct | null> {
  const fields = 'product_name,product_name_fr,brands,nutriments,quantity'
  const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=${fields}`)
  if (!res.ok) return null
  const json = await res.json()
  if (json.status !== 1 || !json.product) return null
  const p = json.product
  const nu = p.nutriments ?? {}
  let kcal = n(nu['energy-kcal_100g'])
  if (!kcal && nu['energy_100g']) kcal = Math.round(n(nu['energy_100g']) / 4.184)
  return {
    name: (p.product_name_fr || p.product_name || `Produit ${code}`).trim(),
    brand: p.brands ? String(p.brands).split(',')[0].trim() : null,
    unit: /\bml\b|\bcl\b|\bl\b/i.test(p.quantity ?? '') ? 'ml' : 'g',
    protein: n(nu.proteins_100g),
    carbs: n(nu.carbohydrates_100g),
    fat: n(nu.fat_100g),
    kcal,
  }
}
