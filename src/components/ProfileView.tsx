import { useState } from 'react'
import { ACTIVITY_LEVELS, bmr, leanMass, maintenance, targets } from '../lib/calc'
import { saveProfile, useStore } from '../lib/store'
import type { Goal, Profile } from '../lib/types'

const GOALS: { value: Goal; label: string }[] = [
  { value: 'seche', label: 'Sèche' },
  { value: 'maintien', label: 'Maintien' },
  { value: 'masse', label: 'Prise de masse' },
]

const r = (x: number) => Math.round(x)

export function ProfileView() {
  const stored = useStore((s) => s.profile)
  // Les pourcentages sont saisis en % mais stockés en fraction (0.23).
  const [p, setP] = useState(() => ({
    weight: String(stored.weight),
    bodyFat: String(r(stored.bodyFat * 1000) / 10),
    activity: String(stored.activity),
    surplus: String(r(stored.surplus * 100)),
    deficit: String(r(stored.deficit * 100)),
    proteinCoef: String(stored.proteinCoef),
    fatCoef: String(stored.fatCoef),
    goal: stored.goal,
  }))
  const num = (s: string) => parseFloat(s.replace(',', '.')) || 0
  const profile: Profile = {
    weight: num(p.weight),
    bodyFat: num(p.bodyFat) / 100,
    activity: num(p.activity),
    surplus: num(p.surplus) / 100,
    deficit: num(p.deficit) / 100,
    proteinCoef: num(p.proteinCoef),
    fatCoef: num(p.fatCoef),
    goal: p.goal,
    updated_at: '',
  }
  const set = (k: keyof typeof p) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setP({ ...p, [k]: e.target.value })
  const t = targets(profile)
  const changed = JSON.stringify({ ...profile, updated_at: '' }) !== JSON.stringify({ ...stored, updated_at: '' })

  return (
    <section>
      <form
        className="card"
        onSubmit={(e) => {
          e.preventDefault()
          const { updated_at: _u, ...rest } = profile
          saveProfile(rest)
        }}
      >
        <h3>Mes mesures</h3>
        <div className="grid2">
          <label>Poids (kg)<input inputMode="decimal" value={p.weight} onChange={set('weight')} /></label>
          <label>Masse grasse (%)<input inputMode="decimal" value={p.bodyFat} onChange={set('bodyFat')} /></label>
        </div>
        <label>
          Activité
          <select value={p.activity} onChange={set('activity')}>
            {ACTIVITY_LEVELS.map((a) => (
              <option key={a.value} value={String(a.value)}>
                ×{a.value} · {a.label}
              </option>
            ))}
            {!ACTIVITY_LEVELS.some((a) => String(a.value) === p.activity) && <option value={p.activity}>×{p.activity} · personnalisé</option>}
          </select>
        </label>
        <label>Multiplicateur personnalisé<input inputMode="decimal" value={p.activity} onChange={set('activity')} /></label>

        <h3>Objectif</h3>
        <div className="seg">
          {GOALS.map((g) => (
            <button type="button" key={g.value} className={p.goal === g.value ? 'on' : ''} onClick={() => setP({ ...p, goal: g.value })}>
              {g.label}
            </button>
          ))}
        </div>
        <div className="grid2">
          <label>Déficit sèche (%)<input inputMode="decimal" value={p.deficit} onChange={set('deficit')} /><span className="muted small">10 à 25 % recommandé</span></label>
          <label>Surplus masse (%)<input inputMode="decimal" value={p.surplus} onChange={set('surplus')} /><span className="muted small">5 à 10 % recommandé</span></label>
        </div>
        <div className="grid2">
          <label>Protéines (g/kg maigre)<input inputMode="decimal" value={p.proteinCoef} onChange={set('proteinCoef')} /><span className="muted small">Entre 1,5 et 2,3</span></label>
          <label>Lipides (g/kg maigre)<input inputMode="decimal" value={p.fatCoef} onChange={set('fatCoef')} /><span className="muted small">0,7 minimum</span></label>
        </div>
        <div className="row end">
          <button type="submit" disabled={!changed}>{changed ? 'Enregistrer' : 'Enregistré'}</button>
        </div>
      </form>

      <div className="card">
        <h3>Résultats</h3>
        <dl className="stats">
          <div><dt>Masse maigre</dt><dd>{r(leanMass(profile) * 10) / 10} kg</dd></div>
          <div><dt>Métabolisme de base</dt><dd>{r(bmr(profile))} kcal</dd></div>
          <div><dt>Maintenance</dt><dd>{r(maintenance(profile))} kcal</dd></div>
          <div className="hl"><dt>Objectif du jour</dt><dd>{t.kcal} kcal</dd></div>
          <div><dt>Protéines</dt><dd>{t.protein} g</dd></div>
          <div><dt>Glucides</dt><dd>{t.carbs} g</dd></div>
          <div><dt>Lipides</dt><dd>{t.fat} g</dd></div>
        </dl>
        <p className="muted small">
          Formule de Katch-McArdle : 370 + 21,6 × masse maigre, multipliée par ton activité. Protéines et lipides sont calculés sur la masse maigre, les glucides prennent le reste des calories. Arrondis à 50 kcal et 5 g, comme dans ton fichier Excel.
        </p>
      </div>
    </section>
  )
}
