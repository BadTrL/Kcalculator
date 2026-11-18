import type { HealthDay } from './types'

/** Dépense du jour : la dépense totale si l'appli santé la donne, sinon rien (on n'invente pas le métabolisme de base). */
export function burned(h: HealthDay | undefined): number | null {
  return h && typeof h.total_kcal === 'number' && h.total_kcal > 0 ? h.total_kcal : null
}

/** Solde du jour : mangé − dépensé. Négatif = déficit. null si la dépense est inconnue. */
export function energyBalance(eaten: number, h: HealthDay | undefined): number | null {
  const b = burned(h)
  return b === null ? null : eaten - b
}

const r = (x: number) => Math.round(x)

/** Durée de sommeil lisible : « 7 h 25 ». */
export function sleepLabel(min: number): string {
  const h = Math.floor(min / 60)
  const m = r(min - h * 60)
  return `${h} h ${String(m).padStart(2, '0')}`
}

/** Ligne texte pour le coach IA. */
export function healthLine(h: HealthDay): string {
  const parts: string[] = []
  if (typeof h.total_kcal === 'number') parts.push(`dépense totale ${r(h.total_kcal)} kcal`)
  if (typeof h.active_kcal === 'number') parts.push(`dont active ${r(h.active_kcal)} kcal`)
  if (typeof h.steps === 'number') parts.push(`${r(h.steps)} pas`)
  if (typeof h.sleep_min === 'number') parts.push(`sommeil ${sleepLabel(h.sleep_min)}`)
  if (typeof h.hrv_ms === 'number') parts.push(`HRV ${r(h.hrv_ms)} ms`)
  if (typeof h.resting_hr === 'number') parts.push(`FC repos ${r(h.resting_hr)}`)
  if (typeof h.weight_kg === 'number') parts.push(`poids ${h.weight_kg} kg`)
  if (typeof h.body_fat_pct === 'number') parts.push(`masse grasse ${h.body_fat_pct} %`)
  return parts.join(', ')
}
