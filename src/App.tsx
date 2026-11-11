import { useCallback, useEffect, useRef, useState } from 'react'
import { Today } from './components/Today'
import { Foods } from './components/Foods'
import { ProfileView } from './components/ProfileView'
import { Settings } from './components/Settings'
import { useStore } from './lib/store'
import { supabase, sync } from './lib/sync'

const TABS = [
  { id: 'today', label: 'Journal', icon: '🍽️' },
  { id: 'foods', label: 'Aliments', icon: '🥑' },
  { id: 'profile', label: 'Profil', icon: '📊' },
  { id: 'settings', label: 'Réglages', icon: '⚙️' },
] as const
type Tab = (typeof TABS)[number]['id']

export default function App() {
  const [tab, setTab] = useState<Tab>('today')
  const [status, setStatus] = useState('Hors ligne')
  const profileStamp = useStore((s) => s.profile.updated_at)
  const dirty = useStore((s) => s.dirty)
  const timer = useRef<number | undefined>(undefined)

  const runSync = useCallback(() => {
    if (!supabase() || !navigator.onLine) return
    setStatus('Synchro…')
    sync()
      .then(setStatus)
      .catch((e) => setStatus('Erreur : ' + (e?.message ?? e)))
  }, [])

  // Synchro au démarrage, au retour sur l'appli, au retour du réseau, et 3 s après chaque modification.
  useEffect(() => {
    runSync()
    const onVis = () => document.visibilityState === 'visible' && runSync()
    window.addEventListener('online', runSync)
    document.addEventListener('visibilitychange', onVis)
    const sub = supabase()?.auth.onAuthStateChange((e) => e === 'SIGNED_IN' && runSync())
    return () => {
      window.removeEventListener('online', runSync)
      document.removeEventListener('visibilitychange', onVis)
      sub?.data.subscription.unsubscribe()
    }
  }, [runSync])

  useEffect(() => {
    if (!dirty.foods.length && !dirty.entries.length && !dirty.profile) return
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(runSync, 3000)
  }, [dirty, runSync])

  return (
    <div className="app">
      <header>
        <h1>Kcalculator</h1>
        <nav className="tabs top">
          {TABS.map((t) => (
            <button key={t.id} className={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </nav>
      </header>
      <main>
        {tab === 'today' && <Today />}
        {tab === 'foods' && <Foods />}
        {tab === 'profile' && <ProfileView key={profileStamp} />}
        {tab === 'settings' && <Settings status={status} onSync={runSync} />}
      </main>
      <nav className="tabs bottom">
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)}>
            <span aria-hidden>{t.icon}</span>
            {t.label}
          </button>
        ))}
      </nav>
    </div>
  )
}
