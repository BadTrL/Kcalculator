import { DIET_LABEL } from '../lib/calc'
import type { Diet } from '../lib/types'

export function DietBadge({ diet }: { diet?: Diet | null }) {
  if (!diet) return null
  return <span className={`badge diet-${diet}`} title={diet === 'vegan' ? 'Vegan' : 'Végétarien'}>{DIET_LABEL[diet]}</span>
}

/** Filtre Tous / Végé / Vegan. Végé inclut les aliments vegan. */
export function DietFilter({ value, onChange }: { value: Diet | null; onChange: (d: Diet | null) => void }) {
  const opts: [Diet | null, string][] = [
    [null, 'Tous'],
    ['vege', 'Végé'],
    ['vegan', 'Vegan'],
  ]
  return (
    <div className="seg diet-filter" role="group" aria-label="Filtrer par régime">
      {opts.map(([d, label]) => (
        <button type="button" key={label} className={value === d ? 'on' : ''} aria-pressed={value === d} onClick={() => onChange(d)}>
          {label}
        </button>
      ))}
    </div>
  )
}
