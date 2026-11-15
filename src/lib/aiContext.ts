import { macrosFor, sum, targets } from './calc'
import { average, dailyTotals } from './history'
import { addDays } from './store'
import { MEALS, type Entry, type Food, type Macros, type Profile } from './types'

/**
 * Résumés texte des données envoyés à l'IA : juste ce qu'il faut pour un avis
 * personnalisé (objectifs, journal récent), sans identifiant ni compte.
 */

type Data = { entries: Record<string, Entry>; foods: Record<string, Food>; profile: Profile }

const r = (x: number) => Math.round(x)
const line = (m: Macros) => `${r(m.kcal)} kcal, P ${r(m.protein)} g, G ${r(m.carbs)} g, L ${r(m.fat)} g`
const GOAL: Record<Profile['goal'], string> = { seche: 'sèche (perte de gras)', maintien: 'maintien', masse: 'prise de masse' }

function dayEntries(d: Data, date: string) {
  return Object.values(d.entries).filter((e) => !e.deleted && e.date === date && d.foods[e.food_id])
}

function profileLines(p: Profile) {
  const t = targets(p)
  return [
    `Objectif : ${GOAL[p.goal]}. Poids ${p.weight} kg, masse grasse ${r(p.bodyFat * 100)} %.`,
    `Cible quotidienne : ${line(t)}.`,
  ]
}

/** Contexte court pour l'analyse d'une photo : objectif et ce qui reste à manger aujourd'hui. */
export function photoContext(d: Data, date: string): string {
  const t = targets(d.profile)
  const eaten = sum(dayEntries(d, date).map((e) => macrosFor(d.foods[e.food_id], e.qty)))
  const left: Macros = { kcal: t.kcal - eaten.kcal, protein: t.protein - eaten.protein, carbs: t.carbs - eaten.carbs, fat: t.fat - eaten.fat }
  return [...profileLines(d.profile), `Déjà mangé ce jour-là : ${line(eaten)}.`, `Reste avant ce repas : ${line(left)}.`].join('\n')
}

/** Contexte du coach : profil, détail du jour et totaux des 14 derniers jours. */
export function coachContext(d: Data, today: string): string {
  const out = [`Date du jour : ${today}.`, ...profileLines(d.profile), '']

  const rows = dayEntries(d, today)
  out.push("Aujourd'hui :")
  if (!rows.length) out.push('- rien noté pour le moment')
  for (const meal of MEALS) {
    const list = rows.filter((e) => e.meal === meal)
    if (!list.length) continue
    const items = list.map((e) => `${d.foods[e.food_id].name} ${e.qty}${d.foods[e.food_id].unit === 'u' ? ' u' : ' ' + d.foods[e.food_id].unit}`)
    const tot = sum(list.map((e) => macrosFor(d.foods[e.food_id], e.qty)))
    out.push(`- ${meal} : ${items.join(', ')} (${line(tot)})`)
  }

  const totals = dailyTotals(d.entries, d.foods)
  const days: string[] = []
  for (let i = 14; i >= 1; i--) days.push(addDays(today, -i))
  const logged = days.filter((day) => totals[day])
  out.push('', '14 jours précédents (jours notés seulement) :')
  if (!logged.length) out.push('- aucun jour noté')
  for (const day of logged) out.push(`- ${day} : ${line(totals[day])}`)
  const avg7 = average(days.slice(-7).filter((day) => totals[day]).map((day) => totals[day]))
  if (avg7) out.push(`Moyenne des jours notés sur 7 jours : ${line(avg7)}.`)
  return out.join('\n')
}
