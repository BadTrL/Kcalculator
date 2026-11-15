/** Thème de l'interface, propre à chaque appareil (pas synchronisé). */
export type Theme = 'auto' | 'light' | 'dark'

const KEY = 'kc-theme'
const BAR = { light: '#f4f6f3', dark: '#0f1412' }

export function getTheme(): Theme {
  try {
    const t = localStorage.getItem(KEY)
    return t === 'light' || t === 'dark' ? t : 'auto'
  } catch {
    return 'auto'
  }
}

/** Applique le thème à la page : data-theme sur <html> et couleur de la barre du navigateur. */
export function applyTheme(t: Theme = getTheme()) {
  const root = document.documentElement
  if (t === 'auto') delete root.dataset.theme
  else root.dataset.theme = t
  const dark = t === 'dark' || (t === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches)
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? BAR.dark : BAR.light)
}

export function setTheme(t: Theme) {
  try {
    if (t === 'auto') localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, t)
  } catch {
    /* stockage indisponible : le choix vaut pour cette session */
  }
  applyTheme(t)
}
