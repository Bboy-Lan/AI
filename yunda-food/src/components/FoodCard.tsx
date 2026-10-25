import { Heart, MapPin } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import type { MatchResult } from '../lib/match'
import { priceBasisLabel } from '../lib/match'
import { areaName } from '../data/campus'
import { itemTasteSummary } from '../lib/taste'
import { cn, FoodImage, Stamp } from './ui'

export function FoodCard({
  result,
  fav,
  onToggleFav,
  index = 0,
}: {
  result: MatchResult
  fav: boolean
  onToggleFav: (id: string) => void
  index?: number
}) {
  const navigate = useNavigate()
  const { item, reasons } = result

  return (
    <div className="ticket rise" style={{ animationDelay: `${Math.min(index, 8) * 45}ms` }}>
      <button
        type="button"
        className="ticket__media"
        onClick={() => navigate(`/item/${item.id}`)}
        aria-label={`查看 ${item.name} 详情`}
      >
        <FoodImage
          src={item.image}
          alt={item.name}
          fallbackChar={item.name.slice(0, 1)}
          category={item.category}
        />
        {item.source === 'sample' && <Stamp corner>示例</Stamp>}
        {item.status === 'local-draft' && (
          <Stamp corner variant="blue">
            本机草稿
          </Stamp>
        )}
      </button>

      <span className="ticket__notch ticket__notch--top" />
      <span className="ticket__notch ticket__notch--bottom" />

      <button
        type="button"
        className="ticket__body"
        onClick={() => navigate(`/item/${item.id}`)}
      >
        <div className="ticket__title-row">
          <span className="ticket__name">{item.name}</span>
        </div>
        <div className="ticket__venue">
          <MapPin size={12} style={{ flex: 'none' }} />
          <span>{item.venue}</span>
        </div>
        <div className="ticket__tags">
          <span className="badge badge--blue">{areaName(item.areaId)}</span>
          <span className={cn('badge', item.spicy >= 2 && 'badge--spicy')}>
            {itemTasteSummary(item)}
          </span>
        </div>
        {reasons.length > 0 ? (
          <div className="ticket__reason">{reasons.join(' · ')}</div>
        ) : (
          <div className="ticket__reason" style={{ background: 'var(--kraft)', borderColor: 'var(--line)', color: 'var(--ink-soft)' }}>
            {item.flavors.slice(0, 3).join(' · ') || '等你第一个来点评'}
          </div>
        )}
      </button>

      <div className="ticket__price-col">
        <button
          type="button"
          className={cn('heart-btn', fav && 'heart-btn--on')}
          aria-label={fav ? '取消想吃' : '想吃'}
          aria-pressed={fav}
          onClick={(e) => {
            e.stopPropagation()
            onToggleFav(item.id)
          }}
        >
          <Heart size={16} fill={fav ? '#fff' : 'none'} />
        </button>
        <div style={{ textAlign: 'right' }}>
          <div className="price">
            <span className="price__sym">¥</span>
            <span className="price__num">{item.price}</span>
          </div>
          <div className="price__basis">{priceBasisLabel(item)}</div>
        </div>
      </div>
    </div>
  )
}
