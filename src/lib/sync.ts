import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { getState, setState } from './store'
import type { Entry, Food, Profile } from './types'

const CONF_KEY = 'kcalculator:supabase'

export interface SupaConf {
  url: string
  key: string
}

/** Config prise dans .env (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY) ou saisie dans Réglages. */
export function getConf(): SupaConf | null {
  const envUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
  const envKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
  if (envUrl && envKey) return { url: envUrl, key: envKey }
  try {
    const raw = localStorage.getItem(CONF_KEY)
    return raw ? (JSON.parse(raw) as SupaConf) : null
  } catch {
    return null
  }
}

export function setConf(c: SupaConf | null) {
  try {
    if (c) localStorage.setItem(CONF_KEY, JSON.stringify(c))
    else localStorage.removeItem(CONF_KEY)
  } catch {
    /* ignore */
  }
  client = null
}

let client: SupabaseClient | null = null
export function supabase(): SupabaseClient | null {
  if (client) return client
  const c = getConf()
  if (!c) return null
  client = createClient(c.url, c.key)
  return client
}

const newer = (a?: { updated_at: string }, b?: { updated_at: string }) => !a || (b && b.updated_at > a.updated_at)

let running = false

/** Supabase renvoie 1000 lignes max par requête : on pagine. */
async function fetchSince(sb: SupabaseClient, table: string, since: string) {
  const out: unknown[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb
      .from(table)
      .select('*')
      .gte('synced_at', since)
      .order('synced_at')
      .range(from, from + 999)
    if (error) throw error
    out.push(...data)
    if (data.length < 1000) return out
  }
}

/** Envoie les changements locaux puis récupère ceux des autres appareils (le plus récent gagne). */
export async function sync(): Promise<string> {
  const sb = supabase()
  if (!sb) return 'Synchro non configurée'
  const { data: auth } = await sb.auth.getUser()
  const user = auth.user
  if (!user) return 'Non connecté'
  if (running) return 'Synchro déjà en cours'
  running = true
  try {
    const start = new Date().toISOString()
    const s = getState()

    // 1. Envoi
    const foods = s.dirty.foods.map((id) => s.foods[id]).filter(Boolean)
    const entries = s.dirty.entries.map((id) => s.entries[id]).filter(Boolean)
    const uid = user.id
    for (let i = 0; i < foods.length; i += 500) {
      const { error } = await sb
        .from('foods')
        .upsert(foods.slice(i, i + 500).map((f) => ({ ...f, deleted: !!f.deleted, user_id: uid })), { onConflict: 'user_id,id' })
      if (error) throw error
    }
    for (let i = 0; i < entries.length; i += 500) {
      const { error } = await sb
        .from('entries')
        .upsert(entries.slice(i, i + 500).map((e) => ({ ...e, deleted: !!e.deleted, user_id: uid })), { onConflict: 'user_id,id' })
      if (error) throw error
    }
    if (s.dirty.profile) {
      const remote = await sb.from('profiles').select('updated_at').eq('user_id', uid).maybeSingle()
      if (remote.error) throw remote.error
      if (!remote.data || remote.data.updated_at < s.profile.updated_at) {
        const { error } = await sb.from('profiles').upsert({ user_id: uid, data: s.profile, updated_at: s.profile.updated_at })
        if (error) throw error
      }
    }

    // 2. Réception
    const since = s.lastSync ?? '1970-01-01T00:00:00Z'
    const [rfData, reData, rp] = await Promise.all([
      fetchSince(sb, 'foods', since),
      fetchSince(sb, 'entries', since),
      sb.from('profiles').select('*').eq('user_id', uid).maybeSingle(),
    ])
    if (rp.error) throw rp.error

    // On repart de l'état courant : l'utilisateur a pu modifier des choses pendant la synchro.
    const cur = getState()
    // Le repère de synchro vient de l'horloge du serveur, pas de celle de l'appareil.
    let mark = s.lastSync
    const seen = (t: string) => {
      if (!mark || t > mark) mark = t
    }
    const nextFoods = { ...cur.foods }
    for (const row of rfData as (Food & { user_id: string; synced_at: string })[]) {
      const { user_id: _u, synced_at, ...f } = row
      seen(synced_at)
      if (newer(nextFoods[f.id], f)) nextFoods[f.id] = f
    }
    const nextEntries = { ...cur.entries }
    for (const row of reData as (Entry & { user_id: string; synced_at: string })[]) {
      const { user_id: _u, synced_at, ...e } = row
      seen(synced_at)
      if (newer(nextEntries[e.id], e)) nextEntries[e.id] = e
    }
    let profile = cur.profile
    const rprof = rp.data as { data: Profile } | null
    if (rprof && rprof.data.updated_at > profile.updated_at) profile = rprof.data

    // On ne garde « à envoyer » que ce qui a changé après le début de la synchro.
    const sent = new Set([...s.dirty.foods, ...s.dirty.entries])
    setState({
      ...cur,
      foods: nextFoods,
      entries: nextEntries,
      profile,
      dirty: {
        foods: cur.dirty.foods.filter((id) => !sent.has(id) || cur.foods[id]?.updated_at > start),
        entries: cur.dirty.entries.filter((id) => !sent.has(id) || cur.entries[id]?.updated_at > start),
        profile: cur.profile.updated_at > start,
      },
      lastSync: mark,
    })
    return 'Synchronisé'
  } finally {
    running = false
  }
}
