import type { Goal, Macros, Meal } from './types'

/**
 * Streak, score de constance et impact des cheat meals.
 * Tout est recalculé à partir du journal : rien de plus n'est stocké, sauf la liste des cheat meals.
 */

// ---------- Dates ----------

export function addDays(date: string, n: number) {
  const d = new Date(date + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/** Nombre de jours de a à b (b - a). */
export function daysBetween(a: string, b: string) {
  return Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 86400000)
}

/** Lundi de la semaine d'une date. */
export function mondayOf(date: string) {
  const dow = new Date(date + 'T12:00:00Z').getUTCDay() // 0 = dimanche
  return addDays(date, -((dow + 6) % 7))
}

// ---------- Cheat meals ----------

export const cheatKey = (date: string, meal: Meal) => `${date}|${meal}`

/** Jours qui ont au moins un cheat meal. */
export function cheatDays(cheats: string[] | undefined): Set<string> {
  return new Set((cheats ?? []).map((k) => k.slice(0, 10)))
}

// ---------- Streak ----------

/** Un jour compte pour le streak quand le journal atteint la moitié de l'objectif (un café seul ne suffit pas). */
export const LOG_THRESHOLD = 0.5
export const FREEZE_EVERY = 7 // un gel gagné tous les 7 jours de streak
export const FREEZE_MAX = 2

export function isLogged(total: Macros | undefined, targetKcal: number) {
  return !!total && total.kcal >= targetKcal * LOG_THRESHOLD
}

export type DayMark = 'done' | 'frozen' | 'missed' | 'pending' | 'none'

export interface Streak {
  current: number
  best: number
  freezes: number // gels en réserve
  todayDone: boolean
  /** Streak en cours mais aujourd'hui pas encore rempli : à valider avant minuit. */
  atRisk: boolean
  marks: Record<string, DayMark>
}

/**
 * Streak à la Duolingo : nombre de jours de suite où le journal est rempli.
 * Tous les 7 jours on gagne un gel (2 max) ; un jour oublié consomme un gel au lieu de casser la série.
 * Aujourd'hui ne casse jamais la série : tant qu'il n'est pas rempli, la série est « en danger ».
 */
export function computeStreak(logged: Set<string>, today: string): Streak {
  const marks: Record<string, DayMark> = {}
  const days = [...logged].filter((d) => d <= today).sort()
  if (days.length === 0) return { current: 0, best: 0, freezes: 0, todayDone: false, atRisk: false, marks }

  let current = 0
  let best = 0
  let freezes = 0
  let earn = 0
  const step = () => {
    current++
    best = Math.max(best, current)
    if (++earn === FREEZE_EVERY) {
      earn = 0
      freezes = Math.min(FREEZE_MAX, freezes + 1)
    }
  }
  for (let d = days[0]; d < today; d = addDays(d, 1)) {
    if (logged.has(d)) {
      step()
      marks[d] = 'done'
    } else if (current > 0 && freezes > 0) {
      freezes--
      marks[d] = 'frozen'
    } else {
      current = 0
      earn = 0
      marks[d] = 'missed'
    }
  }
  const todayDone = logged.has(today)
  if (todayDone) step()
  marks[today] = todayDone ? 'done' : 'pending'
  return { current, best, freezes, todayDone, atRisk: !todayDone && current > 0, marks }
}

// ---------- Score de constance ----------

export const SCORE_WINDOW = 14

/** 1 dans les ±10 % de l'objectif, puis baisse jusqu'à 0 à ±35 %. */
export function kcalAdherence(kcal: number, target: number) {
  if (target <= 0) return 1
  const gap = Math.abs(kcal / target - 1)
  return gap <= 0.1 ? 1 : Math.max(0, 1 - (gap - 0.1) / 0.25)
}

/** 1 dès 90 % de l'objectif de protéines. */
export function proteinAdherence(protein: number, target: number) {
  return target <= 0 ? 1 : Math.min(1, protein / (target * 0.9))
}

export interface DayScore {
  date: string
  score: number // 0..1
  logged: boolean
  cheat: boolean
  /** Cheat meal prévu : le premier de la semaine est toléré. */
  tolerated: boolean
}

export interface Consistency {
  score: number // 0..100
  previous: number | null // même calcul sur les 14 jours d'avant
  days: DayScore[] // du plus ancien au plus récent
  label: string
}

export function scoreLabel(score: number) {
  if (score >= 85) return 'Excellent'
  if (score >= 70) return 'Solide'
  if (score >= 50) return 'Irrégulier'
  return 'À relancer'
}

/**
 * Note d'un jour : 70 % calories (écart à l'objectif) + 30 % protéines. Jour non rempli = 0.
 * Un cheat meal par semaine est « prévu » : sa note calories ne descend pas sous 0,5.
 */
export function dayScore(
  date: string,
  totals: Record<string, Macros>,
  target: Macros,
  cheats: Set<string>,
): DayScore {
  const t = totals[date]
  const cheat = cheats.has(date)
  let tolerated = false
  if (cheat) {
    // Premier jour de cheat de sa semaine ?
    tolerated = true
    for (let d = mondayOf(date); d < date; d = addDays(d, 1)) if (cheats.has(d)) tolerated = false
  }
  if (!isLogged(t, target.kcal)) return { date, score: 0, logged: false, cheat, tolerated }
  let k = kcalAdherence(t.kcal, target.kcal)
  if (tolerated) k = Math.max(k, 0.5)
  const p = proteinAdherence(t.protein, target.protein)
  return { date, score: 0.7 * k + 0.3 * p, logged: true, cheat, tolerated }
}

/**
 * Score de constance sur 14 jours, de 0 à 100. Aujourd'hui n'est compté qu'une fois rempli,
 * et on ne remonte pas avant le premier jour du journal (un nouvel utilisateur n'est pas pénalisé).
 */
export function computeConsistency(
  totals: Record<string, Macros>,
  target: Macros,
  cheats: Set<string>,
  today: string,
): Consistency {
  const loggedDays = Object.keys(totals).filter((d) => d <= today && isLogged(totals[d], target.kcal)).sort()
  const end = isLogged(totals[today], target.kcal) ? today : addDays(today, -1)
  if (loggedDays.length === 0 || loggedDays[0] > end) return { score: 0, previous: null, days: [], label: 'Pas encore de données' }
  const first = loggedDays[0]

  const windowScores = (last: string) => {
    const out: DayScore[] = []
    for (let i = SCORE_WINDOW - 1; i >= 0; i--) {
      const d = addDays(last, -i)
      if (d >= first) out.push(dayScore(d, totals, target, cheats))
    }
    return out
  }
  const mean = (l: DayScore[]) => Math.round((100 * l.reduce((a, b) => a + b.score, 0)) / l.length)

  const days = windowScores(end)
  const prev = windowScores(addDays(end, -SCORE_WINDOW))
  const score = mean(days)
  return { score, previous: prev.length >= 3 ? mean(prev) : null, days, label: scoreLabel(score) }
}

// ---------- Impact des cheat meals sur la semaine ----------

export const KCAL_PER_KG_FAT = 7700

export interface WeekDay {
  date: string
  kcal: number | null // null = pas rempli
  cheat: boolean
  future: boolean
}

export interface CheatImpact {
  days: WeekDay[]
  budget: number // objectif × 7
  eaten: number // total des jours remplis
  /** Kcal au-dessus de l'objectif les jours de cheat meal. */
  excess: number
  /** Écart de toute la semaine à l'objectif, jours remplis seulement (positif = au-dessus). */
  balance: number
  fatGrams: number // équivalent théorique en gras
  /** Sèche : part du déficit de la semaine annulée par les écarts (0..∞), sinon null. */
  deficitEaten: number | null
  /** Sèche : jours de déficit « perdus ». */
  daysLost: number | null
  /** Rattrapage conseillé par jour restant (déjà plafonné), 0 si rien à faire. */
  compensate: number
  remaining: number // jours restants après aujourd'hui dans la semaine
}

export function cheatImpact(
  date: string,
  totals: Record<string, Macros>,
  targetKcal: number,
  maintenanceKcal: number,
  goal: Goal,
  cheats: Set<string>,
  today: string,
): CheatImpact {
  const mon = mondayOf(date)
  const days: WeekDay[] = []
  let eaten = 0
  let excess = 0
  let balance = 0
  for (let i = 0; i < 7; i++) {
    const d = addDays(mon, i)
    const t = totals[d]
    const cheat = cheats.has(d)
    const kcal = t ? t.kcal : null
    days.push({ date: d, kcal, cheat, future: d > today })
    if (kcal !== null) {
      eaten += kcal
      balance += kcal - targetKcal
      if (cheat) excess += Math.max(0, kcal - targetKcal)
    }
  }
  const dailyDeficit = maintenanceKcal - targetKcal
  const seche = goal === 'seche' && dailyDeficit > 0
  const remaining = days.filter((d) => d.future).length
  // Rattraper au plus 15 % de l'objectif par jour : au-delà, mieux vaut accepter l'écart que se priver.
  const compensate = remaining > 0 && balance > 0 ? Math.min(balance / remaining, targetKcal * 0.15) : 0
  return {
    days,
    budget: targetKcal * 7,
    eaten,
    excess,
    balance,
    fatGrams: (excess / KCAL_PER_KG_FAT) * 1000,
    deficitEaten: seche ? excess / (dailyDeficit * 7) : null,
    daysLost: seche ? excess / dailyDeficit : null,
    compensate,
    remaining,
  }
}
