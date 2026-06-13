import type { HTMLAttributes, ReactNode } from 'react'

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode
  padding?: 'none' | 'sm' | 'md' | 'lg'
  inset?: boolean   // uses --bg-inset instead of --bg-card
}

export function Card({ children, padding = 'md', inset = false, className = '', ...props }: CardProps) {
  const paddings = { none: '', sm: 'p-3', md: 'p-4', lg: 'p-6' }
  const bg = inset ? 'bg-[var(--bg-inset)]' : 'bg-[var(--bg-card)]'

  return (
    <div
      className={`${bg} rounded-lg border border-[var(--border)] ${paddings[padding]} ${className}`}
      {...props}
    >
      {children}
    </div>
  )
}
