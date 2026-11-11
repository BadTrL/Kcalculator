import { useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { getConf, setConf, supabase, sync } from '../lib/sync'
import { getState, setState, useStore, type State } from '../lib/store'

export function Settings({ status, onSync }: { status: string; onSync: () => void }) {
  const envConf = !!import.meta.env.VITE_SUPABASE_URL
  const [conf, setC] = useState(() => getConf() ?? { url: '', key: '' })
  const [user, setUser] = useState<User | null>(null)
  const [email, setEmail] = useState('')
  const [pwd, setPwd] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const pending = useStore((s) => s.dirty.foods.length + s.dirty.entries.length + (s.dirty.profile ? 1 : 0))
  const lastSync = useStore((s) => s.lastSync)

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
        setState({ ...s, menus, dirty: { foods: Object.keys(s.foods), entries: Object.keys(s.entries), menus: Object.keys(menus), profile: true }, lastSync: null })
        setMsg('Sauvegarde importée.')
      } catch {
        setMsg('Fichier invalide.')
      }
    })
  }

  return (
    <section>
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
