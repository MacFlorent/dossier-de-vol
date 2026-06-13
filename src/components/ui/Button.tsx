import type { ButtonHTMLAttributes, ReactNode } from 'react'

type Variant = 'primary' | 'ghost' | 'danger' | 'secondary'
type Size = 'sm' | 'md' | 'lg'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  children: ReactNode
}

export function Button({ variant = 'primary', size = 'md', className = '', children, ...props }: ButtonProps) {
  const base = 'inline-flex items-center justify-center font-medium rounded transition-colors focus:outline-none focus:ring-2 focus:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed'

  const variants: Record<Variant, string> = {
    primary: 'bg-[var(--amber-btn)] text-[#0e1217] hover:bg-[var(--amber)] focus:ring-[var(--amber)] font-semibold',
    secondary: 'bg-[var(--bg-card)] text-[var(--text-1)] border border-[var(--border-strong)] hover:border-[var(--amber)] hover:text-[var(--amber)]',
    ghost: 'text-[var(--text-muted)] hover:text-[var(--text-1)] hover:bg-[var(--bg-card)]',
    danger: 'bg-transparent text-[var(--red)] border border-[var(--red)] hover:bg-[var(--red)] hover:text-white',
  }

  const sizes: Record<Size, string> = {
    sm: 'px-3 py-1.5 text-xs gap-1.5',
    md: 'px-4 py-2 text-sm gap-2',
    lg: 'px-5 py-2.5 text-base gap-2',
  }

  return (
    <button
      className={`${base} ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  )
}
