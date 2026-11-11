import { useEffect, useRef, useState } from 'react'
import { BrowserMultiFormatReader, type IScannerControls } from '@zxing/browser'

interface Props {
  onResult: (code: string) => void
  onClose: () => void
}

/** Lecteur de code-barres avec la caméra (arrière si possible), avec saisie manuelle en secours. */
export function Scanner({ onResult, onClose }: Props) {
  const video = useRef<HTMLVideoElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [manual, setManual] = useState('')

  useEffect(() => {
    let controls: IScannerControls | undefined
    let done = false
    const reader = new BrowserMultiFormatReader()
    reader
      .decodeFromConstraints({ video: { facingMode: { ideal: 'environment' } } }, video.current!, (result, _err, c) => {
        if (result && !done) {
          done = true
          c.stop()
          navigator.vibrate?.(80)
          onResult(result.getText())
        }
      })
      .then((c) => {
        controls = c
        if (done) c.stop()
      })
      .catch(() => setError("Impossible d'accéder à la caméra. Vérifie l'autorisation, ou tape le code ci-dessous."))
    return () => {
      done = true
      controls?.stop()
    }
  }, [onResult])

  return (
    <div className="modal" role="dialog" aria-label="Scanner un code-barres">
      <div className="sheet">
        <div className="sheet-head">
          <h2>Scanner un code-barres</h2>
          <button className="ghost" onClick={onClose} aria-label="Fermer">✕</button>
        </div>
        {error ? <p className="muted">{error}</p> : <video ref={video} className="scan-video" muted playsInline />}
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault()
            if (manual.trim()) onResult(manual.trim())
          }}
        >
          <input inputMode="numeric" placeholder="Ou tape le code (ex. 3017620422003)" value={manual} onChange={(e) => setManual(e.target.value)} />
          <button type="submit">OK</button>
        </form>
      </div>
    </div>
  )
}
