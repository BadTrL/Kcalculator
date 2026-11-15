import { useCallback, useEffect, useRef, useState } from 'react'
import { Today } from './components/Today'
import { Foods } from './components/Foods'
import { Menus } from './components/Menus'
import { ProfileView } from './components/ProfileView'
import { Settings } from './components/Settings'
import { useStore } from './lib/store'
import { supabase, sync } from './lib/sync'
import { TabIcon } from './components/Icons'

const TABS = [
  { id: 'today', label: 'Journal', short: 'Journal' },
  { id: 'menus', label: 'Mes menus', short: 'Menus' },
  { id: 'foods', label: 'Aliments', short: 'Aliments' },
  { id: 'profile', label: 'Profil', short: 'Profil' },
  { id: 'settings', label: 'Réglages', short: 'Réglages' },
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
    if (!dirty.foods.length && !dirty.entries.length && !dirty.menus.length && !dirty.profile) return
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(runSync, 3000)
  }, [dirty, runSync])

  return (
    <div className="app">
      <header>
        <span className="brand">Kcalculator</span>
        <nav className="tabs top">
          {TABS.map((t) => (
            <button key={t.id} className={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </nav>
      </header>
      <main>
        {tab !== 'today' && <h1 className="page-title">{TABS.find((t) => t.id === tab)?.label}</h1>}
        {tab === 'today' && <Today />}
        {tab === 'menus' && <Menus />}
        {tab === 'foods' && <Foods />}
        {tab === 'profile' && <ProfileView key={profileStamp} />}
        {tab === 'settings' && <Settings status={status} onSync={runSync} />}
      </main>
      <nav className="tabs bottom">
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)} aria-current={tab === t.id ? 'page' : undefined}>
            <TabIcon id={t.id} />
            {t.short}
          </button>
        ))}
      </nav>
    </div>
  )
}
