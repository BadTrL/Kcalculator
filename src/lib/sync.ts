import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { getState, setState, type State } from './store'
import type { Profile } from './types'

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

// Tables synchronisées ligne par ligne : même nom côté appli et côté Supabase.
const TABLES = ['foods', 'entries', 'menus'] as const
type Row = { id: string; updated_at: string; deleted?: boolean }

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
    const uid = user.id

    // 1. Envoi
    for (const t of TABLES) {
      const rows = (s.dirty[t].map((id) => s[t][id]).filter(Boolean) as Row[]).map((r) => ({ ...r, deleted: !!r.deleted, user_id: uid }))
      for (let i = 0; i < rows.length; i += 500) {
        const { error } = await sb.from(t).upsert(rows.slice(i, i + 500), { onConflict: 'user_id,id' })
        if (error) throw error
      }
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
    const [pulled, rp] = await Promise.all([
      Promise.all(TABLES.map((t) => fetchSince(sb, t, since))),
      sb.from('profiles').select('*').eq('user_id', uid).maybeSingle(),
    ])
    if (rp.error) throw rp.error

    // On repart de l'état courant : l'utilisateur a pu modifier des choses pendant la synchro.
    const cur = getState()
    // Le repère de synchro vient de l'horloge du serveur, pas de celle de l'appareil.
    let mark = s.lastSync
    const merged = {} as Record<(typeof TABLES)[number], Record<string, Row>>
    TABLES.forEach((t, i) => {
      const next: Record<string, Row> = { ...(cur[t] as Record<string, Row>) }
      for (const raw of pulled[i] as (Row & { user_id: string; synced_at: string })[]) {
        const { user_id: _u, synced_at, ...row } = raw
        if (!mark || synced_at > mark) mark = synced_at
        if (newer(next[row.id], row)) next[row.id] = row
      }
      merged[t] = next
    })
    let profile = cur.profile
    const rprof = rp.data as { data: Profile } | null
    if (rprof && rprof.data.updated_at > profile.updated_at) profile = rprof.data

    // On ne garde « à envoyer » que ce qui a changé après le début de la synchro.
    const stillDirty = (t: (typeof TABLES)[number]) => {
      const sent = new Set(s.dirty[t])
      return cur.dirty[t].filter((id) => !sent.has(id) || (cur[t] as Record<string, Row>)[id]?.updated_at > start)
    }
    setState({
      ...cur,
      foods: merged.foods as State['foods'],
      entries: merged.entries as State['entries'],
      menus: merged.menus as State['menus'],
      profile,
      dirty: {
        foods: stillDirty('foods'),
        entries: stillDirty('entries'),
        menus: stillDirty('menus'),
        profile: cur.profile.updated_at > start,
      },
      lastSync: mark,
    })
    return 'Synchronisé'
  } finally {
    running = false
  }
}
