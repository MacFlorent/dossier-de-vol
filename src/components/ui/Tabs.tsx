import type { ReactNode } from 'react'

interface Tab {
  key: string
  label: string
  badge?: string | number   // optional badge on tab
}

interface TabBarProps {
  tabs: Tab[]
  active: string
  onChange: (key: string) => void
  className?: string
}

export function TabBar({ tabs, active, onChange, className = '' }: TabBarProps) {
  return (
    <div className={`flex gap-1 border-b border-[var(--border)] ${className}`}>
      {tabs.map(tab => (
        <button
          key={tab.key}
          onClick={() => onChange(tab.key)}
          className={`
            px-4 py-2.5 text-sm font-medium transition-colors relative
            focus:outline-none
            ${active === tab.key
              ? 'text-[var(--amber)] border-b-2 border-[var(--amber)] -mb-px'
              : 'text-[var(--text-muted)] hover:text-[var(--text-2)]'
            }
          `}
        >
          {tab.label}
          {tab.badge !== undefined && (
            <span className="ml-1.5 px-1.5 py-0.5 text-xs bg-[var(--bg-inset)] rounded-full">
              {tab.badge}
            </span>
          )}
        </button>
      ))}
    </div>
  )
}

interface TabPanelProps {
  children: ReactNode
  className?: string
}

export function TabPanel({ children, className = '' }: TabPanelProps) {
  return <div className={`flex-1 overflow-auto ${className}`}>{children}</div>
}
