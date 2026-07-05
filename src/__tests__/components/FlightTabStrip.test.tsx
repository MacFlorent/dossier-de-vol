import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FlightTabStrip } from '../../components/ui/FlightTabStrip'

const branches = [
  { id: 'b1', label: 'Aller' },
  { id: 'b2', label: 'Retour' },
]

describe('FlightTabStrip', () => {
  it('renders a tab button for each branch', () => {
    render(<FlightTabStrip branches={branches} activeId="b1" onSelect={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Aller' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Retour' })).toBeInTheDocument()
  })

  it('calls onSelect with the branch id when a tab is clicked', async () => {
    const onSelect = vi.fn()
    render(<FlightTabStrip branches={branches} activeId="b1" onSelect={onSelect} />)
    await userEvent.click(screen.getByRole('button', { name: 'Retour' }))
    expect(onSelect).toHaveBeenCalledWith('b2')
  })

  it('does not render an add button when onAdd is omitted', () => {
    render(<FlightTabStrip branches={branches} activeId="b1" onSelect={vi.fn()} />)
    expect(screen.queryByText('+')).not.toBeInTheDocument()
  })

  it('renders an add button and calls onAdd when clicked', async () => {
    const onAdd = vi.fn()
    render(<FlightTabStrip branches={branches} activeId="b1" onSelect={vi.fn()} onAdd={onAdd} />)
    await userEvent.click(screen.getByText('+'))
    expect(onAdd).toHaveBeenCalledOnce()
  })

  it('double-click does not show a rename input when onRename is omitted', async () => {
    render(<FlightTabStrip branches={branches} activeId="b1" onSelect={vi.fn()} />)
    await userEvent.dblClick(screen.getByText('Aller'))
    expect(screen.queryByDisplayValue('Aller')).not.toBeInTheDocument()
  })

  it('double-click shows a rename input when onRename is provided', async () => {
    render(<FlightTabStrip branches={branches} activeId="b1" onSelect={vi.fn()} onRename={vi.fn()} />)
    await userEvent.dblClick(screen.getByText('Aller'))
    expect(screen.getByDisplayValue('Aller')).toBeInTheDocument()
  })

  it('calls onRename with the new label on blur', async () => {
    const onRename = vi.fn()
    render(<FlightTabStrip branches={branches} activeId="b1" onSelect={vi.fn()} onRename={onRename} />)
    await userEvent.dblClick(screen.getByText('Aller'))
    const input = screen.getByDisplayValue('Aller')
    await userEvent.clear(input)
    await userEvent.type(input, 'Retour bis')
    fireEvent.blur(input)
    expect(onRename).toHaveBeenCalledWith('b1', 'Retour bis')
  })
})
