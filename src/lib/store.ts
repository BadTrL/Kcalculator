import { useMemo, useSyncExternalStore } from 'react'
import seed from '../data/seedFoods.json'
import { portionQty } from './calc'
import { iso } from './date'
import { mealKey, mealsOfDay, normalizeCheatKeys, normalizeTime, toMeal } from './meals'
import type { Diet, Entry, Food, Meal, MealInfo, Menu, MenuItem, Profile, Unit } from './types'

/**
 * Stockage local d'abord : tout est enregistré sur l'appareil (localStorage),
 * l'appli marche hors ligne, et la synchro Supabase envoie / récupère les
 * changements quand elle est configurée (voir sync.ts).
 */

export interface State {
  foods: Record<string, Food>
  entries: Record<string, Entry>
  menus: Record<string, Menu>
  /** Infos par repas et par jour (heure), clé « AAAA-MM-JJ|n ». */
  meals: Record<string, MealInfo>
  profile: Profile
  dirty: { foods: string[]; entries: string[]; menus: string[]; meals: string[]; profile: boolean }
  lastSync: string | null
}

const KEY = 'kcalculator:v1'
const SEED_DATE = '2026-01-01T00:00:00.000Z'

const slug = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')

type SeedFood = { name: string; unit: Unit; protein: number; carbs: number; fat: number; kcal: number; diet?: Diet | null }

function seedFoods(): Record<string, Food> {
  const out: Record<string, Food> = {}
  for (const f of seed as SeedFood[]) {
    // Identifiant stable : le même aliment importé sur deux appareils ne crée pas de doublon.
    const id = 'seed-' + slug(f.name)
    out[id] = { id, ...f, diet: f.diet ?? null, barcode: null, brand: null, updated_at: SEED_DATE }
  }
  return out
}

/**
 * Les sauvegardes d'avant la catégorie végé/vegan n'ont pas de champ diet.
 * On le complète pour les aliments importés que l'utilisateur n'a jamais modifiés.
 */
function backfillDiet(foods: Record<string, Food>, base: Record<string, Food>) {
  const out = { ...foods }
  for (const [id, f] of Object.entries(out)) {
    if (f.diet !== undefined) continue
    const b = base[id]
    out[id] = { ...f, diet: b && f.updated_at === SEED_DATE ? b.diet ?? null : null }
  }
  return out
}

const defaultProfile: Profile = {
  weight: 90,
  bodyFat: 0.23,
  activity: 1.45,
  surplus: 0.1,
  deficit: 0.25,
  proteinCoef: 2.2,
  fatCoef: 0.9,
  goal: 'seche',
  updated_at: SEED_DATE,
}

/**
 * Repas numérotés : les anciennes lignes du journal ont meal = 'Matin', 'Midi'…
 * On les convertit en numéros (Matin → 1, Midi → 2, Collation → 3, Soir → 4) sans les renvoyer :
 * le serveur est converti par supabase/migrations/003_repas_numerotes.sql, et la synchro
 * convertit aussi ce qu'elle reçoit.
 */
export function normalizeEntries(entries: Record<string, Entry>): Record<string, Entry> {
  let changed = false
  const out: Record<string, Entry> = {}
  for (const [id, e] of Object.entries(entries)) {
    const meal = toMeal(e.meal)
    if (meal !== e.meal) changed = true
    out[id] = meal === e.meal ? e : { ...e, meal }
  }
  return changed ? out : entries
}

export function normalizeProfile(p: Profile): Profile {
  if (!p.cheatMeals) return p
  const cheatMeals = normalizeCheatKeys(p.cheatMeals)
  return JSON.stringify(cheatMeals) === JSON.stringify(p.cheatMeals) ? p : { ...p, cheatMeals }
}

function initial(): State {
  const foods = seedFoods()
  return {
    foods,
    entries: {},
    menus: {},
    meals: {},
    profile: defaultProfile,
    dirty: { foods: Object.keys(foods), entries: [], menus: [], meals: [], profile: true },
    lastSync: null,
  }
}

function load(): State {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const base = initial()
      const saved = JSON.parse(raw) as Partial<State>
      // Les anciennes sauvegardes n'ont pas forcément tous les champs (ex. menus).
      const foods = saved.foods ? backfillDiet(saved.foods, base.foods) : base.foods
      const profile = saved.profile ? normalizeProfile(saved.profile) : base.profile
      const entries = saved.entries ? normalizeEntries(saved.entries) : base.entries
      return { ...base, ...saved, foods, entries, profile, dirty: { ...base.dirty, menus: [], meals: [], ...saved.dirty } }
    }
  } catch {
    /* stockage indisponible : on repart des valeurs par défaut */
  }
  return initial()
}

let state: State = load()
const listeners = new Set<() => void>()

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state))
  } catch {
    /* ignore */
  }
}

export function getState() {
  return state
}

export function setState(next: State) {
  state = next
  save()
  listeners.forEach((l) => l())
}

function subscribe(l: () => void) {
  listeners.add(l)
  return () => listeners.delete(l)
}

export function useStore<T>(sel: (s: State) => T): T {
  const s = useSyncExternalStore(subscribe, getState)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => sel(s), [s])
}

const now = () => new Date().toISOString()
const uniq = (a: string[]) => Array.from(new Set(a))
export const newId = () => crypto.randomUUID()

// ---------- Actions ----------

export function saveFood(food: Omit<Food, 'updated_at'>) {
  const f: Food = { ...food, updated_at: now() }
  setState({
    ...state,
    foods: { ...state.foods, [f.id]: f },
    dirty: { ...state.dirty, foods: uniq([...state.dirty.foods, f.id]) },
  })
  return f
}

export function deleteFood(id: string) {
  const f = state.foods[id]
  if (f) saveFood({ ...f, deleted: true })
}

export function saveEntry(entry: Omit<Entry, 'updated_at'>) {
  const e: Entry = { ...entry, updated_at: now() }
  setState({
    ...state,
    entries: { ...state.entries, [e.id]: e },
    dirty: { ...state.dirty, entries: uniq([...state.dirty.entries, e.id]) },
  })
}

export function deleteEntry(id: string) {
  const e = state.entries[id]
  if (e) saveEntry({ ...e, deleted: true })
}

export function saveProfile(p: Omit<Profile, 'updated_at'>) {
  // On garde les champs que le formulaire du profil ne connaît pas (ex. cheatMeals).
  setState({ ...state, profile: { ...state.profile, ...p, updated_at: now() }, dirty: { ...state.dirty, profile: true } })
}

/** Marque / démarque un repas du journal comme cheat meal. On ne garde que les 6 derniers mois. */
export function toggleCheat(date: string, meal: Meal) {
  const key = mealKey(date, meal)
  const list = state.profile.cheatMeals ?? []
  const today = iso(new Date())
  const limit = addDays(date < today ? today : date, -183)
  const next = (list.includes(key) ? list.filter((k) => k !== key) : [...list, key]).filter((k) => k.slice(0, 10) >= limit).sort()
  saveProfile({ ...state.profile, cheatMeals: next })
}

/** Heure (facultative) d'un repas d'une journée. null ou '' l'efface. */
export function setMealTime(date: string, meal: Meal, time: string | null) {
  const id = mealKey(date, meal)
  const t = normalizeTime(time)
  const prev = state.meals[id]
  if ((prev && !prev.deleted ? prev.time : null) === t) return
  const m: MealInfo = { id, date, meal, time: t, deleted: t === null, updated_at: now() }
  setState({
    ...state,
    meals: { ...state.meals, [id]: m },
    dirty: { ...state.dirty, meals: uniq([...state.dirty.meals, id]) },
  })
}

/** Heure enregistrée d'un repas, ou null. */
export function mealTime(s: State, date: string, meal: Meal): string | null {
  const m = s.meals[mealKey(date, meal)]
  return m && !m.deleted ? m.time : null
}

/** Repas proposés pour un jour : le nombre habituel du profil, plus ceux déjà utilisés ce jour-là. */
export function dayMeals(s: State, date: string): Meal[] {
  const used: Meal[] = []
  for (const e of Object.values(s.entries)) if (!e.deleted && e.date === date) used.push(e.meal)
  return mealsOfDay(s.profile.mealsPerDay, used)
}

export function saveMenu(menu: Omit<Menu, 'updated_at'>) {
  const m: Menu = { ...menu, updated_at: now() }
  setState({
    ...state,
    menus: { ...state.menus, [m.id]: m },
    dirty: { ...state.dirty, menus: uniq([...state.dirty.menus, m.id]) },
  })
  return m
}

export function deleteMenu(id: string) {
  const m = state.menus[id]
  if (m) saveMenu({ ...m, deleted: true })
}

/** Jour suivant / précédent d'une date AAAA-MM-JJ. */
export function addDays(date: string, n: number) {
  const d = new Date(date + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/**
 * Ajoute tous les aliments d'un menu au repas choisi du journal.
 * portions > 1 (batch cooking) : on ajoute une portion, c.-à-d. les quantités divisées par portions,
 * sur `days` jours consécutifs à partir de `date`.
 */
export function addItemsToDay(items: MenuItem[], date: string, meal: Meal, portions = 1, days = 1) {
  const t = now()
  const entries = { ...state.entries }
  const ids: string[] = []
  for (let d = 0; d < Math.max(1, days); d++) {
    const day = addDays(date, d)
    for (const it of items) {
      const food = state.foods[it.food_id]
      if (!food || food.deleted) continue
      const id = newId()
      entries[id] = { id, date: day, meal, food_id: it.food_id, qty: portions > 1 ? portionQty(it.qty, portions, food.unit) : it.qty, updated_at: t }
      ids.push(id)
    }
  }
  setState({ ...state, entries, dirty: { ...state.dirty, entries: uniq([...state.dirty.entries, ...ids]) } })
  return ids.length
}

export function activeMenus(s: State) {
  return Object.values(s.menus)
    .filter((m) => !m.deleted)
    .sort((a, b) => a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' }))
}

export function activeFoods(s: State) {
  return Object.values(s.foods)
    .filter((f) => !f.deleted)
    .sort((a, b) => a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' }))
}

export function findByBarcode(code: string) {
  return Object.values(state.foods).find((f) => !f.deleted && f.barcode === code)
}
