import { useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { getConf, setConf, supabase, sync } from '../lib/sync'
import { getState, normalizeEntries, normalizeProfile, setState, useStore, type State } from '../lib/store'
import { getTheme, setTheme, type Theme } from '../lib/theme'
import { deleteAiKey, getAiKeyStatus, saveAiKey, type AiKeyStatus } from '../lib/ai'

const THEMES: { id: Theme; label: string }[] = [
  { id: 'auto', label: 'Auto' },
  { id: 'light', label: 'Clair' },
  { id: 'dark', label: 'Sombre' },
]

/**
 * Clé API Anthropic, gérée comme un mot de passe : champ masqué, écriture seule.
 * L'appli ne relit jamais la clé, seulement ses 4 derniers caractères.
 */
function AiKeyForm({ userId }: { userId: string }) {
  const [status, setStatus] = useState<AiKeyStatus | null | 'missing' | 'loading'>('loading')
  const [editing, setEditing] = useState(false)
  const [key, setKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ text: string; warn?: boolean } | null>(null)

  useEffect(() => {
    let alive = true
    setStatus('loading')
    getAiKeyStatus()
      .then((s) => alive && setStatus(s))
      .catch((e) => {
        if (!alive) return
        setStatus(null)
        setMsg({ text: String(e.message ?? e), warn: true })
      })
    return () => {
      alive = false
    }
  }, [userId])

  async function save() {
    setBusy(true)
    setMsg(null)
    try {
      const hint = await saveAiKey(key)
      setStatus({ hint, updatedAt: new Date().toISOString() })
      setEditing(false)
      setMsg({ text: 'Clé enregistrée.' })
    } catch (e) {
      setMsg({ text: String((e as Error).message ?? e), warn: true })
    } finally {
      // La clé ne reste pas en mémoire dans le formulaire, même en cas d'erreur.
      setKey('')
      setBusy(false)
    }
  }

  async function remove() {
    if (!confirm('Supprimer ta clé API ? L’IA utilisera la clé partagée du projet s’il y en a une.')) return
    setBusy(true)
    setMsg(null)
    try {
      await deleteAiKey()
      setStatus(null)
      setMsg({ text: 'Clé supprimée.' })
    } catch (e) {
      setMsg({ text: String((e as Error).message ?? e), warn: true })
    } finally {
      setBusy(false)
    }
  }

  if (status === 'loading') return <p className="muted small">Chargement…</p>
  if (status === 'missing')
    return (
      <p className="note warn small">
        Pour enregistrer ta clé ici, lance d'abord la migration <code>supabase/migrations/004_cle_ia.sql</code> dans Supabase (SQL Editor).
      </p>
    )

  const showForm = editing || !status
  return (
    <>
      {status && !editing && (
        <>
          <p>
            Clé API enregistrée : <strong>••••{status.hint}</strong>
          </p>
          <p className="muted small">Ajoutée le {new Date(status.updatedAt).toLocaleDateString('fr-FR')}. Elle est chiffrée sur ton serveur et ne s'affiche plus jamais en entier.</p>
          <div className="row end">
            <button type="button" className="ghost" disabled={busy} onClick={remove}>Supprimer</button>
            <button type="button" className="secondary" disabled={busy} onClick={() => { setEditing(true); setMsg(null) }}>Remplacer</button>
          </div>
        </>
      )}
      {showForm && (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (key.trim()) save()
          }}
        >
          <p className="muted small">
            Colle ta clé API Anthropic (console.anthropic.com → API keys). Elle est envoyée une seule fois, chiffrée sur ton serveur Supabase, et seule la fonction « ai » peut la lire.
            {!status && ' Sans clé ici, l’IA utilise la clé partagée du projet s’il y en a une.'}
          </p>
          <label>
            Clé API
            <input
              type="password"
              name="anthropic-api-key"
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              placeholder="sk-ant-…"
              value={key}
              onChange={(e) => setKey(e.target.value)}
            />
          </label>
          <div className="row end">
            {editing && (
              <button type="button" className="ghost" disabled={busy} onClick={() => { setEditing(false); setKey(''); setMsg(null) }}>Annuler</button>
            )}
            <button type="submit" disabled={busy || !key.trim()}>{busy ? 'Enregistrement…' : 'Enregistrer la clé'}</button>
          </div>
        </form>
      )}
      {msg && <p className={msg.warn ? 'note warn small' : 'note small'}>{msg.text}</p>}
    </>
  )
}

export function Settings({ status, onSync }: { status: string; onSync: () => void }) {
  const envConf = !!import.meta.env.VITE_SUPABASE_URL
  const [conf, setC] = useState(() => getConf() ?? { url: '', key: '' })
  const [user, setUser] = useState<User | null>(null)
  const [email, setEmail] = useState('')
  const [pwd, setPwd] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const pending = useStore((s) => s.dirty.foods.length + s.dirty.entries.length + s.dirty.menus.length + s.dirty.meals.length + (s.dirty.profile ? 1 : 0))
  const lastSync = useStore((s) => s.lastSync)
  const [theme, setT] = useState<Theme>(getTheme)

  useEffect(() => {
    const sb = supabase()
    if (!sb) return
    sb.auth.getUser().then(({ data }) => setUser(data.user))
    const { data } = sb.auth.onAuthStateChange((_e, session) => setUser(session?.user ?? null))
    return () => data.subscription.unsubscribe()
  }, [conf])

  async function auth(kind: 'in' | 'up') {
    const sb = supabase()
    if (!sb) return
    setMsg(null)
    const res = kind === 'in' ? await sb.auth.signInWithPassword({ email, password: pwd }) : await sb.auth.signUp({ email, password: pwd })
    if (res.error) return setMsg(res.error.message)
    if (kind === 'up' && !res.data.session) return setMsg('Compte créé. Confirme ton e-mail puis connecte-toi.')
    setMsg(await sync().catch((e) => String(e.message ?? e)))
  }

  function exportJson() {
    const blob = new Blob([JSON.stringify(getState(), null, 1)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `kcalculator-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
  }

  function importJson(file: File) {
    file.text().then((t) => {
      try {
        const s = JSON.parse(t) as State
        if (!s.foods || !s.entries || !s.profile) throw new Error()
        if (!confirm('Remplacer les données de cet appareil par cette sauvegarde ?')) return
        const menus = s.menus ?? {}
        const meals = s.meals ?? {}
        // Les sauvegardes d'avant les repas numérotés ont meal = 'Matin', 'Midi'… : on convertit.
        const entries = normalizeEntries(s.entries)
        const profile = normalizeProfile(s.profile)
        setState({
          ...s,
          entries,
          profile,
          menus,
          meals,
          dirty: { foods: Object.keys(s.foods), entries: Object.keys(entries), menus: Object.keys(menus), meals: Object.keys(meals), profile: true },
          lastSync: null,
        })
        setMsg('Sauvegarde importée.')
      } catch {
        setMsg('Fichier invalide.')
      }
    })
  }

  return (
    <section>
      <div className="card">
        <h3>Apparence</h3>
        <div className="seg" role="radiogroup" aria-label="Thème">
          {THEMES.map((t) => (
            <button
              key={t.id}
              type="button"
              role="radio"
              aria-checked={theme === t.id}
              className={theme === t.id ? 'on' : ''}
              onClick={() => {
                setTheme(t.id)
                setT(t.id)
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
        <p className="muted small">« Auto » suit le réglage clair ou sombre de ton téléphone ou de ton PC. Ce choix est propre à chaque appareil.</p>
      </div>

      <div className="card">
        <h3>Synchronisation entre appareils</h3>
        {!envConf && (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              setConf(conf.url && conf.key ? conf : null)
              setC({ ...conf })
              setMsg('Configuration enregistrée.')
            }}
          >
            <p className="muted small">Colle l'URL et la clé « anon public » de ton projet Supabase (Project Settings → API).</p>
            <label>URL du projet<input value={conf.url} onChange={(e) => setC({ ...conf, url: e.target.value.trim() })} placeholder="https://xxxx.supabase.co" /></label>
            <label>Clé anon<input value={conf.key} onChange={(e) => setC({ ...conf, key: e.target.value.trim() })} /></label>
            <div className="row end"><button type="submit" className="secondary">Enregistrer</button></div>
          </form>
        )}

        {supabase() &&
          (user ? (
            <>
              <p>Connecté : <strong>{user.email}</strong></p>
              <p className="muted small">
                {status} · {pending} changement(s) à envoyer
                {lastSync && ` · dernière synchro ${new Date(lastSync).toLocaleString('fr-FR')}`}
              </p>
              <div className="row end">
                <button className="ghost" onClick={() => supabase()?.auth.signOut()}>Se déconnecter</button>
                <button onClick={onSync}>Synchroniser</button>
              </div>
            </>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault()
                auth('in')
              }}
            >
              <label>E-mail<input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
              <label>Mot de passe<input type="password" autoComplete="current-password" value={pwd} onChange={(e) => setPwd(e.target.value)} /></label>
              <div className="row end">
                <button type="button" className="ghost" onClick={() => auth('up')}>Créer un compte</button>
                <button type="submit">Se connecter</button>
              </div>
            </form>
          ))}
        {msg && <p className="note">{msg}</p>}
      </div>

      <div className="card">
        <h3>Intelligence artificielle</h3>
        <p className="muted small">
          La photo de plat (bouton « Photo » dans le Journal) et le Coach passent par la fonction « ai » de ton projet Supabase.
          Il faut être connecté ci-dessus. Mise en place : README, section « IA ».
        </p>
        {!supabase() && <p className="note warn small">Configure d'abord la synchronisation Supabase.</p>}
        {supabase() && user && <AiKeyForm userId={user.id} />}
      </div>

      <div className="card">
        <h3>Sauvegarde</h3>
        <p className="muted small">Exporte toutes tes données dans un fichier, ou restaure une sauvegarde.</p>
        <div className="row">
          <button className="secondary" onClick={exportJson}>Exporter</button>
          <label className="button secondary">
            Importer
            <input type="file" accept="application/json" hidden onChange={(e) => e.target.files?.[0] && importJson(e.target.files[0])} />
          </label>
        </div>
      </div>
    </section>
  )
}
