import { useMemo, useState } from 'react'
import { targets } from '../lib/calc'
import { iso } from '../lib/date'
import { average, dailyTotals, level, monthGrid } from '../lib/history'
import { useStore } from '../lib/store'
import { MacroLine } from './Menus'

const WEEK = ['L', 'M', 'M', 'J', 'V', 'S', 'D']

/** Calendrier du journal : un mois, le total de kcal de chaque jour, et la moyenne du mois. */
export function Calendar({ date, onPick, onClose }: { date: string; onPick: (d: string) => void; onClose: () => void }) {
  const entries = useStore((s) => s.entries)
  const foods = useStore((s) => s.foods)
  const profile = useStore((s) => s.profile)
  const target = useMemo(() => targets(profile).kcal, [profile])
  const totals = useMemo(() => dailyTotals(entries, foods), [entries, foods])
  const [ym, setYm] = useState(() => ({ y: +date.slice(0, 4), m: +date.slice(5, 7) }))
  const today = iso(new Date())

  const grid = monthGrid(ym.y, ym.m)
  const logged = grid.filter((d): d is string => !!d && !!totals[d])
  const avg = average(logged.map((d) => totals[d]))
  const title = new Date(Date.UTC(ym.y, ym.m - 1, 15)).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' })
  const move = (k: number) => setYm(({ y, m }) => ({ y: m + k > 12 ? y + 1 : m + k < 1 ? y - 1 : y, m: ((m + k + 11) % 12) + 1 }))
  const pick = (d: string) => {
    onPick(d)
    onClose()
  }

  return (
    <div className="modal" role="dialog" aria-label="Historique du journal">
      <div className="sheet">
        <div className="sheet-head">
          <h2>Historique</h2>
          <button className="ghost" onClick={onClose} aria-label="Fermer">✕</button>
        </div>
        <div className="datebar">
          <button className="ghost" onClick={() => move(-1)} aria-label="Mois précédent">‹</button>
          <span className="date">{title}</span>
          <button className="ghost" onClick={() => move(1)} aria-label="Mois suivant">›</button>
        </div>
        <div className="cal" role="grid">
          {WEEK.map((w, i) => (
            <span key={i} className="cal-head muted small">{w}</span>
          ))}
          {grid.map((d, i) =>
            d ? (
              <button
                key={d}
                type="button"
                className={['cal-day', totals[d] ? 'has ' + level(totals[d].kcal, target) : '', d === date ? 'sel' : '', d === today ? 'today' : ''].join(' ')}
                onClick={() => pick(d)}
                aria-label={`${d}${totals[d] ? ` : ${Math.round(totals[d].kcal)} kcal` : ''}`}
              >
                <span className="cal-num">{+d.slice(8)}</span>
                <span className="cal-kcal">{totals[d] ? Math.round(totals[d].kcal) : ''}</span>
              </button>
            ) : (
              <span key={'x' + i} />
            ),
          )}
        </div>
        <p className="muted small cal-legend">
          <span className="dot ok" /> objectif ±10 % <span className="dot low" /> en dessous <span className="dot high" /> au-dessus (objectif actuel : {target} kcal)
        </p>
        <div className="menu-total portion">
          <span>
            {logged.length} jour{logged.length > 1 ? 's' : ''} enregistré{logged.length > 1 ? 's' : ''}
            {avg && <span className="muted small"> · moyenne / jour</span>}
          </span>
          {avg ? <MacroLine m={avg} /> : <span className="muted small">aucun repas ce mois-ci</span>}
        </div>
        <div className="row end">
          <button type="button" className="secondary" onClick={() => pick(today)}>Aujourd'hui</button>
        </div>
      </div>
    </div>
  )
}
