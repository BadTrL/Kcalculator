import { useId, useMemo } from 'react'
import { maintenance, targets } from '../lib/calc'
import { iso } from '../lib/date'
import { dailyTotals } from '../lib/history'
import { toggleCheat, useStore } from '../lib/store'
import {
  FREEZE_MAX,
  addDays,
  cheatDays,
  cheatImpact,
  cheatKey,
  computeConsistency,
  computeStreak,
  isLogged,
  mondayOf,
  type CheatImpact,
  type Consistency,
  type DayMark,
  type Streak,
} from '../lib/streak'
import type { Meal } from '../lib/types'
import '../progress.css'

const r = (x: number) => Math.round(x)
const signed = (x: number) => (x > 0 ? '+' : x < 0 ? '−' : '') + Math.abs(r(x)).toLocaleString('fr-FR')
const WEEK = ['L', 'M', 'M', 'J', 'V', 'S', 'D']

/** Toutes les données de progression, recalculées depuis le journal. */
function useProgress(date: string) {
  const entries = useStore((s) => s.entries)
  const foods = useStore((s) => s.foods)
  const profile = useStore((s) => s.profile)
  const today = iso(new Date())
  return useMemo(() => {
    const target = targets(profile)
    const totals = dailyTotals(entries, foods)
    const cheats = cheatDays(profile.cheatMeals)
    const logged = new Set(Object.keys(totals).filter((d) => isLogged(totals[d], target.kcal)))
    return {
      today,
      target,
      streak: computeStreak(logged, today),
      consistency: computeConsistency(totals, target, cheats, today),
      week: cheatImpact(date, totals, target.kcal, maintenance(profile), profile.goal, cheats, today),
      goal: profile.goal,
    }
  }, [entries, foods, profile, date, today])
}

// ---------- Petits éléments visuels ----------

function Flame({ on, size = 28 }: { on: boolean; size?: number }) {
  return (
    <svg className={'flame' + (on ? ' on' : '')} width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <path d="M12 2c1 3.5-1.5 5-1.5 7.5 0 1.3.9 2.2 2 2.2 1.6 0 2.2-1.6 1.8-3.4C17 10 19 13 19 15.5 19 19.6 15.9 22 12 22s-7-2.4-7-6.3C5 11 9.5 8.5 12 2z" />
      <path className="flame-core" d="M12 13.5c.4 1.6 2.3 2.4 2.3 4.2 0 1.5-1 2.6-2.3 2.6s-2.3-1-2.3-2.4c0-1.8 1.9-2.4 2.3-4.4z" />
    </svg>
  )
}

function ScoreRing({ score, size = 56 }: { score: number; size?: number }) {
  const R = 15.9
  const c = 2 * Math.PI * R
  return (
    <svg className="score-ring" width={size} height={size} viewBox="0 0 36 36" aria-hidden>
      <circle cx="18" cy="18" r={R} className="track" />
      <circle cx="18" cy="18" r={R} className="value" strokeDasharray={`${(score / 100) * c} ${c}`} transform="rotate(-90 18 18)" />
      <text x="18" y="18" dominantBaseline="central" textAnchor="middle">{score}</text>
    </svg>
  )
}

/** Barres des 7 jours de la semaine, ligne d'objectif, part au-dessus de l'objectif en couleur. */
function WeekChart({ week, target, mini = false }: { week: CheatImpact; target: number; mini?: boolean }) {
  const W = 280
  const H = mini ? 44 : 150
  const top = mini ? 2 : 18
  const bottom = mini ? 0 : 20
  const max = Math.max(target * 1.4, ...week.days.map((d) => d.kcal ?? 0))
  const y = (k: number) => top + (H - top - bottom) * (1 - k / max)
  const slot = W / 7
  const bw = slot * (mini ? 0.6 : 0.56)
  const ty = y(target)
  const stripes = 'cheat-stripes' + useId().replace(/:/g, '')
  return (
    <svg className={'week-chart' + (mini ? ' mini' : '')} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Calories de la semaine par rapport à l'objectif">
      <defs>
        <pattern id={stripes} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="6" height="6" className="stripe-bg" />
          <rect width="3" height="6" className="stripe-fg" />
        </pattern>
      </defs>
      {week.days.map((d, i) => {
        const x = i * slot + (slot - bw) / 2
        const base = H - bottom
        const k = d.kcal
        const ratio = k === null ? 0 : k / target
        const cls = k === null ? '' : d.cheat ? 'cheat' : ratio > 1.1 ? 'high' : ratio < 0.9 ? 'low' : 'ok'
        return (
          <g key={d.date} className={'wd ' + cls}>
            {k === null ? (
              d.future && !mini && <rect x={x} y={ty} width={bw} height={base - ty} rx="6" className="planned" />
            ) : (
              <>
                <rect x={x} y={y(Math.min(k, target))} width={bw} height={base - y(Math.min(k, target))} rx="6" className="under" />
                {k > target && <rect x={x} y={y(k)} width={bw} height={ty - y(k) + 6} rx="6" className="over" style={d.cheat ? { fill: `url(#${stripes})` } : undefined} />}
              </>
            )}
            {!mini && d.cheat && (
              <text x={x + bw / 2} y={k === null ? ty - 6 : y(k) - 5} textAnchor="middle" className="cheat-emoji">🍕</text>
            )}
            {!mini && (
              <text x={x + bw / 2} y={H - 5} textAnchor="middle" className="day-letter">{WEEK[i]}</text>
            )}
          </g>
        )
      })}
      <line x1="0" x2={W} y1={ty} y2={ty} className="target-line" />
      {!mini && <text x={W} y={ty - 4} textAnchor="end" className="target-label">objectif {target}</text>}
    </svg>
  )
}

// ---------- Carte du Journal ----------

export function ProgressCard({ date, onOpen }: { date: string; onOpen: () => void }) {
  const { streak, consistency, week } = useProgress(date)
  return (
    <button type="button" className="card progress-card" onClick={onOpen} aria-label="Voir streak, constance et cheat meals">
      <div className={'pc-tile streak-tile' + (streak.atRisk ? ' risk' : '')}>
        <Flame on={streak.todayDone} />
        <div>
          <strong>{streak.current}</strong>
          <span className="small muted">{streak.atRisk ? 'à valider' : streak.current > 1 ? 'jours' : 'jour'}</span>
        </div>
      </div>
      <div className="pc-tile">
        <ScoreRing score={consistency.score} size={40} />
        <div>
          <strong className="small">Constance</strong>
          <span className="small muted">{consistency.days.length ? consistency.label : '—'}</span>
        </div>
      </div>
      <div className="pc-tile week-tile">
        <WeekChart week={week} target={week.budget / 7} mini />
        <span className={'small ' + (week.balance > 0 ? 'over-text' : 'muted')}>
          {week.eaten ? `${signed(week.balance)} kcal` : 'semaine'}
          {week.excess > 0 && ' 🍕'}
        </span>
      </div>
    </button>
  )
}

/** Bouton 🍕 dans l'en-tête d'un repas. */
export function CheatToggle({ date, meal }: { date: string; meal: Meal }) {
  const on = useStore((s) => (s.profile.cheatMeals ?? []).includes(cheatKey(date, meal)))
  return (
    <button
      type="button"
      className={'cheat-toggle' + (on ? ' on' : '')}
      onClick={() => toggleCheat(date, meal)}
      aria-pressed={on}
      title={on ? 'Retirer le cheat meal' : 'Marquer ce repas comme cheat meal'}
    >
      <span aria-hidden>🍕</span>
      {on ? 'Cheat meal' : 'Cheat ?'}
    </button>
  )
}

// ---------- Fenêtre détaillée ----------

const MARK_LABEL: Record<DayMark, string> = {
  done: 'rempli',
  frozen: 'gel utilisé',
  missed: 'oublié',
  pending: "aujourd'hui, à remplir",
  none: '',
}

function StreakSection({ streak, today }: { streak: Streak; today: string }) {
  // 4 semaines complètes, du lundi d'il y a 3 semaines jusqu'à dimanche.
  const start = addDays(mondayOf(today), -21)
  const cells = Array.from({ length: 28 }, (_, i) => addDays(start, i))
  const msg = streak.todayDone
    ? 'Journée validée, la flamme est allumée.'
    : streak.atRisk
      ? `Remplis au moins la moitié de ton objectif aujourd'hui pour garder ta série de ${streak.current} jour${streak.current > 1 ? 's' : ''}.`
      : streak.current === 0 && streak.best > 0
        ? 'Série cassée. Remplis ton journal aujourd’hui pour relancer la flamme.'
        : "Remplis ton journal aujourd'hui pour allumer ta première flamme."
  return (
    <section className="pg-section">
      <div className="streak-hero">
        <Flame on={streak.todayDone} size={56} />
        <div>
          <strong className="big">{streak.current}</strong>
          <span> jour{streak.current > 1 ? 's' : ''} de suite</span>
          <p className="small muted">
            Record : {streak.best} · Gels : {'❄️'.repeat(streak.freezes)}
            <span className="freeze-empty">{'❄️'.repeat(FREEZE_MAX - streak.freezes)}</span>
          </p>
        </div>
      </div>
      <p className={'note' + (streak.atRisk ? ' warn' : '')}>{msg}</p>
      <div className="streak-grid" role="list" aria-label="4 dernières semaines">
        {WEEK.map((w, i) => (
          <span key={'h' + i} className="muted small">{w}</span>
        ))}
        {cells.map((d) => {
          const m: DayMark = d > today ? 'none' : streak.marks[d] ?? 'none'
          return (
            <span key={d} role="listitem" className={'sg ' + m + (d === today ? ' today' : '')} title={`${d} ${MARK_LABEL[m]}`}>
              {m === 'frozen' ? '❄️' : +d.slice(8)}
            </span>
          )
        })}
      </div>
      <p className="small muted">
        Un jour compte quand le journal atteint la moitié de ton objectif. Tous les 7 jours de suite tu gagnes un gel (2 max) : il sauve
        automatiquement ta série si tu oublies un jour.
      </p>
    </section>
  )
}

function ConsistencySection({ c }: { c: Consistency }) {
  const trend = c.previous === null ? null : c.score - c.previous
  return (
    <section className="pg-section">
      <h3>Score de constance</h3>
      <div className="score-hero">
        <ScoreRing score={c.score} size={88} />
        <div>
          <strong>{c.label}</strong>
          <p className="small muted">
            Sur les {c.days.length} dernier{c.days.length > 1 ? 's' : ''} jour{c.days.length > 1 ? 's' : ''}
            {trend !== null && (
              <span className={trend >= 0 ? 'trend up' : 'trend down'}>
                {' '}
                {trend >= 0 ? '▲' : '▼'} {Math.abs(trend)} pts vs les 14 jours d'avant
              </span>
            )}
          </p>
        </div>
      </div>
      {c.days.length > 0 && (
        <div className="score-bars" aria-label="Note de chaque jour">
          {c.days.map((d) => (
            <div key={d.date} className="sb" title={`${d.date} : ${r(d.score * 100)}/100${d.cheat ? ' (cheat meal)' : ''}`}>
              <div className="sb-track">
                <div className={'sb-fill' + (d.cheat ? ' cheat' : '') + (!d.logged ? ' empty' : '')} style={{ height: `${Math.max(4, d.score * 100)}%` }} />
              </div>
              <span className="small muted">{d.cheat ? '🍕' : WEEK[(new Date(d.date + 'T12:00:00Z').getUTCDay() + 6) % 7]}</span>
            </div>
          ))}
        </div>
      )}
      <p className="small muted">
        Chaque jour est noté sur 100 : 70 points pour les calories (plein dans les ±10 % de l'objectif, 0 au-delà de ±35 %) et 30 points pour
        les protéines (plein dès 90 %). Un jour non rempli vaut 0. Le premier cheat meal de la semaine est prévu, donc toléré : il garde au
        moins la moitié des points calories.
      </p>
    </section>
  )
}

function CheatSection({ week, target, goal }: { week: CheatImpact; target: number; goal: string }) {
  const n = week.days.filter((d) => d.cheat).length
  const pct = (x: number) => `${Math.min(100, Math.max(0, x * 100))}%`
  const under = Math.min(week.eaten, week.budget)
  const over = Math.max(0, week.eaten - week.budget)
  const scale = Math.max(week.budget, week.eaten)
  return (
    <section className="pg-section">
      <h3>Cheat meals de la semaine</h3>
      <WeekChart week={week} target={target} />
      <div className="budget">
        <div className="budget-label small">
          <span>
            Budget semaine : <strong>{r(week.eaten).toLocaleString('fr-FR')}</strong> / {r(week.budget).toLocaleString('fr-FR')} kcal
          </span>
          <span className={week.balance > 0 ? 'over-text' : 'muted'}>{week.eaten ? `${signed(week.balance)} kcal` : ''}</span>
        </div>
        <div className="budget-track">
          <div className="budget-fill" style={{ width: pct(under / scale) }} />
          {over > 0 && <div className="budget-over" style={{ width: pct(over / scale) }} />}
        </div>
        <p className="small muted">Écart calculé sur les jours remplis uniquement.</p>
      </div>

      {n === 0 ? (
        <p className="note">
          Aucun cheat meal cette semaine. Pour en marquer un, touche <strong>🍕 Cheat ?</strong> dans le repas concerné du journal.
        </p>
      ) : week.excess <= 0 ? (
        <p className="note">
          {n > 1 ? `${n} cheat meals` : 'Un cheat meal'} cette semaine, et la journée reste dans l'objectif. Impact nul.
        </p>
      ) : (
        <div className="impact">
          <div className="impact-tiles">
            <div>
              <strong>+{r(week.excess)}</strong>
              <span className="small muted">kcal au-dessus de l'objectif les jours de cheat</span>
            </div>
            <div>
              <strong>≈ {r(week.fatGrams)} g</strong>
              <span className="small muted">de gras en théorie (7 700 kcal = 1 kg)</span>
            </div>
            {week.deficitEaten !== null && week.daysLost !== null && (
              <div className={week.deficitEaten > 0.5 ? 'warn' : ''}>
                <strong>{r(week.deficitEaten * 100)} %</strong>
                <span className="small muted">
                  du déficit de la semaine, soit ≈ {week.daysLost.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} jour
                  {week.daysLost >= 2 ? 's' : ''} de sèche
                </span>
              </div>
            )}
          </div>
          {week.deficitEaten !== null && (
            <div className="deficit-bar" aria-label="Part du déficit de la semaine annulée">
              <div className="deficit-kept" style={{ width: pct(1 - week.deficitEaten) }} />
              <div className="deficit-eaten" style={{ width: pct(week.deficitEaten) }} />
            </div>
          )}
          <ul className="impact-notes small">
            <li>
              Sur la balance, attends-toi à +0,5 à 1,5 kg demain ou après-demain : c'est surtout de l'eau et du glycogène, pas du gras. Ça
              repart en 2 à 4 jours.
            </li>
            {week.compensate > 0 ? (
              <li>
                Pour finir la semaine à l'équilibre, vise environ <strong>{r(week.compensate)} kcal de moins</strong> sur chacun des{' '}
                {week.remaining} jour{week.remaining > 1 ? 's' : ''} restant{week.remaining > 1 ? 's' : ''}, en gardant tes protéines.
                {week.compensate >= target * 0.15 - 1 && " C'est plafonné à 15 % de l'objectif : inutile de tout rattraper en te privant."}
              </li>
            ) : week.balance > 0 ? (
              <li>La semaine se termine au-dessus de l'objectif. Reprends simplement ton objectif normal demain, sans compenser à l'excès.</li>
            ) : (
              <li>Le reste de la semaine absorbe déjà l'écart : rien à compenser.</li>
            )}
            {n > 1 && <li>{n} jours de cheat cette semaine : seul le premier est toléré dans le score de constance.</li>}
            {goal === 'masse' && <li>En prise de masse, un écart ponctuel pèse peu : l'important est de rester proche de ton surplus en moyenne.</li>}
          </ul>
        </div>
      )}
    </section>
  )
}

export function ProgressSheet({ date, onClose }: { date: string; onClose: () => void }) {
  const { streak, consistency, week, target, today, goal } = useProgress(date)
  const mon = mondayOf(date)
  const range = `${new Date(mon + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} – ${new Date(addDays(mon, 6) + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}`
  return (
    <div className="modal" role="dialog" aria-label="Progression">
      <div className="sheet progress-sheet">
        <div className="sheet-head">
          <h2>Progression</h2>
          <button className="ghost" onClick={onClose} aria-label="Fermer">✕</button>
        </div>
        <StreakSection streak={streak} today={today} />
        <ConsistencySection c={consistency} />
        <p className="small muted week-range">Semaine du {range}</p>
        <CheatSection week={week} target={target.kcal} goal={goal} />
      </div>
    </div>
  )
}
