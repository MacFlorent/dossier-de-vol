import type { InputHTMLAttributes } from 'react'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  hint?: string
}

export function Input({ label, error, hint, className = '', id, ...props }: InputProps) {
  const inputId = id ?? (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined)

  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label htmlFor={inputId} className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wide">
          {label}
        </label>
      )}
      <input
        id={inputId}
        className={`
          w-full px-3 py-2 rounded text-sm text-[var(--text-1)] font-mono
          bg-[var(--bg-inset)] border border-[var(--border)]
          focus:outline-none focus:border-[var(--amber)] focus:ring-1 focus:ring-[var(--amber)]
          placeholder:text-[var(--text-dim)]
          disabled:opacity-50 disabled:cursor-not-allowed
          ${error ? 'border-[var(--red)]' : ''}
          ${className}
        `}
        {...props}
      />
      {error && <span className="text-xs text-[var(--red)]">{error}</span>}
      {hint && !error && <span className="text-xs text-[var(--text-dim)]">{hint}</span>}
    </div>
  )
}
