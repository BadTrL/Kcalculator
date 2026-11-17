import { useCallback, useEffect, useRef, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { Today } from './components/Today'
import { Foods } from './components/Foods'
import { Menus } from './components/Menus'
import { ProfileView } from './components/ProfileView'
import { Settings } from './components/Settings'
import { Coach } from './components/Coach'
import { useStore } from './lib/store'
import { supabase, sync } from './lib/sync'
import { TabIcon } from './components/Icons'
import { initials } from './lib/initials'

/** Onglets principaux (en haut sur PC, en bas sur téléphone). */
const TABS = [
  { id: 'today', label: 'Journal' },
  { id: 'menus', label: 'Mes menus' },
  { id: 'coach', label: 'Coach' },
] as const
/** Pages du menu déroulant (bouton ☰). */
const MORE = [
  { id: 'foods', label: 'Mes aliments' },
  { id: 'profile', label: 'Mon profil' },
  { id: 'settings', label: 'Mes réglages' },
] as const
type Tab = (typeof TABS)[number]['id'] | (typeof MORE)[number]['id']

function useUser() {
  const [user, setUser] = useState<User | null>(null)
  useEffect(() => {
    const sb = supabase()
    if (!sb) return
    sb.auth.getUser().then(({ data }) => setUser(data.user))
    const { data } = sb.auth.onAuthStateChange((_e, session) => setUser(session?.user ?? null))
    return () => data.subscription.unsubscribe()
  }, [])
  return user
}

/** Menu déroulant : Mes aliments, Mon profil, Mes réglages. */
function MoreMenu({ tab, onPick }: { tab: Tab; onPick: (t: Tab) => void }) {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !box.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', close)
    return () => {
      document.removeEventListener('pointerdown', close)
      document.removeEventListener('keydown', close)
    }
  }, [open])
  return (
    <div className="more" ref={box}>
      <button className={'icon-btn burger' + (MORE.some((m) => m.id === tab) ? ' on' : '')} onClick={() => setOpen(!open)} aria-label="Menu" aria-expanded={open} aria-haspopup="menu">
        <TabIcon id="burger" size={22} />
      </button>
      {open && (
        <div className="dropdown" role="menu">
          {MORE.map((m) => (
            <button
              key={m.id}
              role="menuitem"
              className={tab === m.id ? 'on' : ''}
              onClick={() => {
                onPick(m.id)
                setOpen(false)
              }}
            >
              <TabIcon id={m.id} size={20} />
              {m.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default function App() {
  const [tab, setTab] = useState<Tab>('today')
  const [status, setStatus] = useState('Hors ligne')
  const profileStamp = useStore((s) => s.profile.updated_at)
  const dirty = useStore((s) => s.dirty)
  const timer = useRef<number | undefined>(undefined)
  const user = useUser()

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
    if (!Object.values(dirty).some((v) => (Array.isArray(v) ? v.length : v))) return
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(runSync, 3000)
  }, [dirty, runSync])

  const title = [...TABS, ...MORE].find((t) => t.id === tab)?.label
  const go = (t: Tab) => {
    setTab(t)
    window.scrollTo(0, 0)
  }

  return (
    <div className="app">
      <header>
        <span className="brand">Kcalculator</span>
        <nav className="tabs top">
          {TABS.map((t) => (
            <button key={t.id} className={tab === t.id ? 'on' : ''} onClick={() => go(t.id)}>
              {t.label}
            </button>
          ))}
        </nav>
        <div className="head-actions">
          <button
            className={'avatar' + (user ? '' : ' signin')}
            onClick={() => go('settings')}
            title={user ? `Connecté : ${user.email}` : 'Se connecter'}
            aria-label={user ? `Compte ${user.email}` : 'Se connecter'}
          >
            {user ? initials(user) : 'Sign In'}
          </button>
          <MoreMenu tab={tab} onPick={go} />
        </div>
      </header>
      <main>
        {tab !== 'today' && <h1 className="page-title">{title}</h1>}
        {tab === 'today' && <Today />}
        {tab === 'menus' && <Menus />}
        {tab === 'foods' && <Foods />}
        {tab === 'coach' && <Coach />}
        {tab === 'profile' && <ProfileView key={profileStamp} />}
        {tab === 'settings' && <Settings status={status} onSync={runSync} />}
      </main>
      <nav className="tabs bottom">
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? 'on' : ''} onClick={() => go(t.id)} aria-current={tab === t.id ? 'page' : undefined}>
            <TabIcon id={t.id} />
            {t.label}
          </button>
        ))}
      </nav>
    </div>
  )
}
