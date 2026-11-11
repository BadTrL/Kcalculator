import { useMemo, useSyncExternalStore } from 'react'
import seed from '../data/seedFoods.json'
import type { Entry, Food, Profile, Unit } from './types'

/**
 * Stockage local d'abord : tout est enregistré sur l'appareil (localStorage),
 * l'appli marche hors ligne, et la synchro Supabase envoie / récupère les
 * changements quand elle est configurée (voir sync.ts).
 */

export interface State {
  foods: Record<string, Food>
  entries: Record<string, Entry>
  profile: Profile
  dirty: { foods: string[]; entries: string[]; profile: boolean }
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

function seedFoods(): Record<string, Food> {
  const out: Record<string, Food> = {}
  for (const f of seed as { name: string; unit: Unit; protein: number; carbs: number; fat: number; kcal: number }[]) {
    // Identifiant stable : le même aliment importé sur deux appareils ne crée pas de doublon.
    const id = 'seed-' + slug(f.name)
    out[id] = { id, ...f, barcode: null, brand: null, updated_at: SEED_DATE }
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

function initial(): State {
  const foods = seedFoods()
  return {
    foods,
    entries: {},
    profile: defaultProfile,
    dirty: { foods: Object.keys(foods), entries: [], profile: true },
    lastSync: null,
  }
}

function load(): State {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return { ...initial(), ...JSON.parse(raw) }
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
  setState({ ...state, profile: { ...p, updated_at: now() }, dirty: { ...state.dirty, profile: true } })
}

export function activeFoods(s: State) {
  return Object.values(s.foods)
    .filter((f) => !f.deleted)
    .sort((a, b) => a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' }))
}

export function findByBarcode(code: string) {
  return Object.values(state.foods).find((f) => !f.deleted && f.barcode === code)
}
