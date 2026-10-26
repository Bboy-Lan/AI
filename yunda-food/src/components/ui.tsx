import { useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Star, X, Info, AlertTriangle, Lightbulb, BadgeCheck } from 'lucide-react'

export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}

/* ---------------- 印章 ---------------- */

export function Stamp({
  children,
  variant,
  corner,
  className,
}: {
  children: ReactNode
  variant?: 'red' | 'blue' | 'solid' | 'green' | 'orange'
  corner?: boolean
  className?: string
}) {
  return (
    <span
      className={cn(
        'stamp',
        variant === 'blue' && 'stamp--blue',
        variant === 'solid' && 'stamp--solid',
        variant === 'green' && 'stamp--green',
        variant === 'orange' && 'stamp--orange',
        corner && 'stamp--corner',
        className,
      )}
    >
      {children}
    </span>
  )
}

/* ---------------- 胶囊 ---------------- */

export function Chip({
  active,
  onClick,
  children,
  yellow,
  title,
}: {
  active?: boolean
  onClick?: () => void
  children: ReactNode
  yellow?: boolean
  title?: string
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={cn('chip', yellow && 'chip--yellow', active && 'chip--on')}
    >
      {children}
    </button>
  )
}

/* ---------------- 分段选择 ---------------- */

export function Seg<T extends string>({
  options,
  value,
  onChange,
}: {
  options: Array<{ value: T; label: ReactNode }>
  value: T
  onChange: (v: T) => void
}) {
  return (
    <div className="seg" role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={value === o.value}
          className={cn('seg__item', value === o.value && 'seg__item--on')}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/* ---------------- 底部弹层 ---------------- */

export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean
  onClose: () => void
  title: ReactNode
  children: ReactNode
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  if (!open) return null
  return createPortal(
    <div className="sheet-mask" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="sheet__grab" />
        <div className="sheet__title">
          <span>{title}</span>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="关闭">
            <X size={17} />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  )
}

/* ---------------- 提示条 ---------------- */

export function Notice({
  tone = 'blue',
  children,
  icon,
}: {
  tone?: 'blue' | 'yellow' | 'red' | 'green'
  children: ReactNode
  icon?: ReactNode
}) {
  const defaultIcon =
    tone === 'red' ? <AlertTriangle size={16} /> : tone === 'yellow' ? <Lightbulb size={16} /> : tone === 'green' ? <BadgeCheck size={16} /> : <Info size={16} />
  return (
    <div className={`notice notice--${tone}`}>
      {icon ?? defaultIcon}
      <div>{children}</div>
    </div>
  )
}

/* ---------------- 空状态 ---------------- */

export function EmptyState({
  art,
  title,
  children,
  action,
}: {
  art?: ReactNode
  title: string
  children?: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="empty">
      <div className="empty__art">{art ?? '🍚'}</div>
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action}
    </div>
  )
}

/* ---------------- 图片（失败兜底，永不破图） ---------------- */

export function FoodImage({
  src,
  alt,
  fallbackChar,
  category,
  className,
}: {
  src?: string | null
  alt: string
  fallbackChar: string
  category: 'meal' | 'snack' | 'drink'
  className?: string
}) {
  // 图片地址在热更新或卡片复用时改变，旧地址的加载失败不能让新图片永远停在占位图。
  const [imageState, setImageState] = useState({ src, failed: false, loaded: false })
  const failed = imageState.src === src ? imageState.failed : false
  const loaded = imageState.src === src ? imageState.loaded : false
  if (!src || failed) {
    return (
      <div className={cn(`ticket__media-fallback ticket__media-fallback--${category}`, className)}>
        {fallbackChar}
      </div>
    )
  }
  return (
    <>
      {!loaded && <div className={cn(`ticket__media-fallback ticket__media-fallback--${category}`, className)}>{fallbackChar}</div>}
      <img
        src={src}
        alt={alt}
        loading="lazy"
        onLoad={() => setImageState({ src, failed: false, loaded: true })}
        onError={() => setImageState({ src, failed: true, loaded: false })}
        style={loaded ? undefined : { opacity: 0, position: 'absolute', inset: 0 }}
        className={className}
      />
    </>
  )
}

/* ---------------- 星级 ---------------- */

export function Stars({
  value,
  onChange,
  size = 20,
}: {
  value: number
  onChange?: (v: number) => void
  size?: number
}) {
  const readonly = !onChange
  return (
    <div className={cn('stars', readonly && 'stars--readonly')}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          aria-label={`${n} 星`}
          onClick={() => onChange?.(n)}
        >
          <Star
            size={size}
            color={n <= value ? '#E94E3C' : '#c9c2ad'}
            fill={n <= value ? '#E94E3C' : 'none'}
          />
        </button>
      ))}
    </div>
  )
}

export function Spinner() {
  return <div className="spinner" aria-label="加载中" />
}
