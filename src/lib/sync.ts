import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { toMeal } from './meals'
import { getState, normalizeProfile, setState, type State } from './store'
import type { HealthDay, Profile } from './types'

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

/** Table absente : le projet Supabase n'a pas encore la migration qui la crée. */
const isMissingTable = (e: { code?: string; message?: string }) =>
  e.code === 'PGRST205' || e.code === '42P01' || /could not find the table|relation .* does not exist/i.test(e.message ?? '')

// Tables ajoutées par une migration : si elles manquent, on synchronise le reste quand même.
const OPTIONAL_TABLES = new Set<string>(['meals', 'chats'])
/** Tables optionnelles absentes du projet Supabase pendant cette synchro. */
let missingTables = new Set<string>()

/** Supabase renvoie 1000 lignes max par requête : on pagine. */
async function fetchSince(sb: SupabaseClient, table: string, since: string) {
  const out: unknown[] = []
  if (missingTables.has(table)) return out
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb
      .from(table)
      .select('*')
      .gte('synced_at', since)
      .order('synced_at')
      .range(from, from + 999)
    if (error && OPTIONAL_TABLES.has(table) && isMissingTable(error)) {
      missingTables.add(table)
      return out
    }
    if (error) throw error
    out.push(...data)
    if (data.length < 1000) return out
  }
}

// Tables synchronisées ligne par ligne : même nom côté appli et côté Supabase.
const TABLES = ['foods', 'entries', 'menus', 'meals', 'chats'] as const
type Row = { id: string; updated_at: string; deleted?: boolean }

// Colonnes ajoutées par des migrations, groupées par migration. Toujours envoyées avec une valeur,
// pour ne jamais écraser une colonne « not null » avec null.
type Migration = '002' | '006'
const NEW_COLUMNS: Partial<Record<(typeof TABLES)[number], Partial<Record<Migration, Record<string, unknown>>>>> = {
  foods: {
    '002': { diet: null },
    '006': { fibre: null, sugar: null, sat_fat: null, sodium: null, iron: null, calcium: null },
  },
  menus: { '002': { portions: 1 } },
}
/** Ordre d'abandon quand le serveur refuse une colonne : la migration la plus récente d'abord. */
const MIGRATION_ORDER: Migration[] = ['006', '002']
const MIGRATION_FILE: Record<Migration, string> = { '002': '002_vege_batch.sql', '006': '006_sante_micros.sql' }
/** Migrations pas encore lancées sur le projet Supabase (détectées pendant cette synchro). */
let missingMigrations = new Set<Migration>()
const isMissingColumn = (e: { code?: string; message?: string }) =>
  e.code === 'PGRST204' || /could not find the '.*' column/i.test(e.message ?? '')

function defaultsOf(t: (typeof TABLES)[number]) {
  return Object.assign({}, ...Object.values(NEW_COLUMNS[t] ?? {})) as Record<string, unknown>
}

function withoutMissing(t: (typeof TABLES)[number], row: Record<string, unknown>) {
  const out = { ...row }
  for (const m of missingMigrations) for (const k of Object.keys(NEW_COLUMNS[t]?.[m] ?? {})) delete out[k]
  return out
}

/** Prochaine migration à considérer comme absente pour cette table, ou null s'il n'en reste pas. */
function nextMissing(t: (typeof TABLES)[number]): Migration | null {
  return MIGRATION_ORDER.find((m) => NEW_COLUMNS[t]?.[m] && !missingMigrations.has(m)) ?? null
}

/** Récupère les résumés santé écrits par l'appli santé (table health_daily, migration 006). */
async function pullHealth(sb: SupabaseClient, since: string): Promise<{ rows: (HealthDay & { synced_at: string })[]; missing: boolean }> {
  const rows: (HealthDay & { synced_at: string })[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb
      .from('health_daily')
      .select('date,source,active_kcal,total_kcal,steps,sleep_min,hrv_ms,resting_hr,weight_kg,body_fat_pct,updated_at,synced_at')
      .gte('synced_at', since)
      .order('synced_at')
      .range(from, from + 999)
    if (error && isMissingTable(error)) return { rows, missing: true }
    if (error) throw error
    rows.push(...(data as (HealthDay & { synced_at: string })[]))
    if (data.length < 1000) return { rows, missing: false }
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
    const uid = user.id

    // 1. Envoi
    missingMigrations = new Set()
    missingTables = new Set()
    for (const t of TABLES) {
      const defaults = defaultsOf(t)
      const rows = (s.dirty[t].map((id) => s[t][id]).filter(Boolean) as Row[]).map(
        (r) => ({ ...defaults, ...r, deleted: !!r.deleted, user_id: uid }) as Record<string, unknown>,
      )
      for (const k of Object.keys(defaults)) for (const r of rows) r[k] ??= defaults[k]
      for (let i = 0; i < rows.length; i += 500) {
        const chunk = rows.slice(i, i + 500)
        let { error } = await sb.from(t).upsert(chunk.map((r) => withoutMissing(t, r)), { onConflict: 'user_id,id' })
        // Base pas encore migrée : on synchronise quand même, sans les colonnes des migrations manquantes.
        for (let m = nextMissing(t); error && m && isMissingColumn(error); m = nextMissing(t)) {
          missingMigrations.add(m)
          ;({ error } = await sb.from(t).upsert(chunk.map((r) => withoutMissing(t, r)), { onConflict: 'user_id,id' }))
        }
        // Table pas encore créée (migration 003) : on garde ces changements pour la prochaine fois.
        if (error && OPTIONAL_TABLES.has(t) && isMissingTable(error)) {
          missingTables.add(t)
          break
        }
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
    const [pulled, rp, health] = await Promise.all([
      Promise.all(TABLES.map((t) => fetchSince(sb, t, since))),
      sb.from('profiles').select('*').eq('user_id', uid).maybeSingle(),
      pullHealth(sb, s.healthSync ?? '1970-01-01T00:00:00Z'),
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
        const { user_id: _u, synced_at, ...rest } = raw
        // Anciens créneaux nommés ('Midi'…) ou numéro stocké en texte : on ramène à un numéro.
        const row = t === 'entries' || t === 'meals' ? ({ ...rest, meal: toMeal((rest as Row & { meal?: unknown }).meal) } as Row) : rest
        if (!mark || synced_at > mark) mark = synced_at
        if (newer(next[row.id], row)) next[row.id] = row
      }
      merged[t] = next
    })
    let profile = cur.profile
    const rprof = rp.data as { data: Profile } | null
    if (rprof && rprof.data.updated_at > profile.updated_at) profile = normalizeProfile(rprof.data)

    // Résumés santé : une ligne par jour, la plus récente gagne.
    const healthDays = { ...cur.health }
    let healthMark = s.healthSync
    for (const { synced_at, ...h } of health.rows) {
      if (!healthMark || synced_at > healthMark) healthMark = synced_at
      if (newer(healthDays[h.date], h)) healthDays[h.date] = h
    }

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
      meals: merged.meals as State['meals'],
      chats: merged.chats as State['chats'],
      profile,
      health: healthDays,
      healthSync: healthMark,
      dirty: {
        foods: stillDirty('foods'),
        entries: stillDirty('entries'),
        menus: stillDirty('menus'),
        // Table absente côté serveur : rien n'a été envoyé, tout reste à envoyer.
        meals: missingTables.has('meals') ? cur.dirty.meals : stillDirty('meals'),
        chats: missingTables.has('chats') ? cur.dirty.chats : stillDirty('chats'),
        profile: cur.profile.updated_at > start,
      },
      lastSync: mark,
    })
    // Une fois la migration lancée, on renvoie tout une fois pour remplir les nouvelles colonnes.
    const RESEND = 'kcalculator:resend-new-columns'
    try {
      if (missingMigrations.size) localStorage.setItem(RESEND, '1')
      else if (localStorage.getItem(RESEND)) {
        localStorage.removeItem(RESEND)
        const st = getState()
        setState({ ...st, dirty: { ...st.dirty, foods: Object.keys(st.foods), menus: Object.keys(st.menus) } })
      }
    } catch {
      /* ignore */
    }
    if (missingMigrations.has('002')) return `Synchronisé, sauf végé/vegan et batch : lance supabase/migrations/${MIGRATION_FILE['002']}`
    if (missingTables.has('meals')) return 'Synchronisé, sauf les heures des repas : lance supabase/migrations/003_repas_numerotes.sql'
    if (missingTables.has('chats')) return "Synchronisé, sauf l'historique du coach : lance supabase/migrations/005_historique_coach.sql"
    if (missingMigrations.has('006') || health.missing)
      return `Synchronisé, sauf les micronutriments et les données santé : lance supabase/migrations/${MIGRATION_FILE['006']}`
    return 'Synchronisé'
  } finally {
    running = false
  }
}
