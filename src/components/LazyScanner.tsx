import { lazy, Suspense, type ComponentProps } from 'react'

// Le lecteur de code-barres est lourd : on ne le charge qu'à la première ouverture.
const Scanner = lazy(() => import('./Scanner').then((m) => ({ default: m.Scanner })))

export function LazyScanner(props: ComponentProps<typeof Scanner>) {
  return (
    <Suspense fallback={<div className="modal"><div className="sheet">Chargement de la caméra…</div></div>}>
      <Scanner {...props} />
    </Suspense>
  )
}
