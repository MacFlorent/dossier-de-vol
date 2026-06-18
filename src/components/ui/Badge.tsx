import type { ReactNode, CSSProperties, MouseEventHandler } from 'react'

type BadgeVariant = 'success' | 'warning' | 'error' | 'info' | 'neutral'

interface BadgeProps {
  variant?: BadgeVariant
  children: ReactNode
  className?: string
  style?: CSSProperties
  onClick?: MouseEventHandler<HTMLSpanElement>
}

export function Badge({ variant = 'neutral', children, className = '', style, onClick }: BadgeProps) {
  const variants: Record<BadgeVariant, string> = {
    success: 'bg-[var(--green)]/20 text-[var(--green)] border-[var(--green)]/40',
    warning: 'bg-[var(--amber)]/20 text-[var(--amber)] border-[var(--amber)]/40',
    error: 'bg-[var(--red)]/20 text-[var(--red)] border-[var(--red)]/40',
    info: 'bg-[var(--blue)]/20 text-[var(--blue)] border-[var(--blue)]/40',
    neutral: 'bg-[var(--bg-card)] text-[var(--text-muted)] border-[var(--border)]',
  }

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${variants[variant]} ${className}`}
      style={style}
      onClick={onClick}
    >
      {children}
    </span>
  )
}
