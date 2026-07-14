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

  it('calls onSelect with the branch id when a tab is activated with Enter', () => {
    const onSelect = vi.fn()
    render(<FlightTabStrip branches={branches} activeId="b1" onSelect={onSelect} />)
    fireEvent.keyDown(screen.getByRole('button', { name: 'Retour' }), { key: 'Enter' })
    expect(onSelect).toHaveBeenCalledWith('b2')
  })

  it('calls onSelect with the branch id when a tab is activated with Space', () => {
    const onSelect = vi.fn()
    render(<FlightTabStrip branches={branches} activeId="b1" onSelect={onSelect} />)
    fireEvent.keyDown(screen.getByRole('button', { name: 'Retour' }), { key: ' ' })
    expect(onSelect).toHaveBeenCalledWith('b2')
  })

  it('does not call onSelect for other keys', () => {
    const onSelect = vi.fn()
    render(<FlightTabStrip branches={branches} activeId="b1" onSelect={onSelect} />)
    fireEvent.keyDown(screen.getByRole('button', { name: 'Retour' }), { key: 'Tab' })
    expect(onSelect).not.toHaveBeenCalled()
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

  it('does not render a close button when onClose is omitted', () => {
    render(<FlightTabStrip branches={[{ id: 'b1', label: 'LFPN', closable: true }]} activeId="b1" onSelect={vi.fn()} />)
    expect(screen.queryByLabelText(/fermer/i)).not.toBeInTheDocument()
  })

  it('does not render a close button on a non-closable tab even with onClose provided', () => {
    render(<FlightTabStrip branches={[{ id: 'b1', label: 'LFPN', closable: false }]} activeId="b1" onSelect={vi.fn()} onClose={vi.fn()} />)
    expect(screen.queryByLabelText(/fermer/i)).not.toBeInTheDocument()
  })

  it('renders a close button and calls onClose with the tab id when closable', async () => {
    const onClose = vi.fn()
    render(<FlightTabStrip branches={[{ id: 'b1', label: 'LFPN', closable: true }]} activeId="b1" onSelect={vi.fn()} onClose={onClose} />)
    await userEvent.click(screen.getByLabelText(/fermer/i))
    expect(onClose).toHaveBeenCalledWith('b1')
  })

  it('clicking the close button does not trigger onSelect', async () => {
    const onSelect = vi.fn()
    render(<FlightTabStrip branches={[{ id: 'b1', label: 'LFPN', closable: true }]} activeId="b1" onSelect={onSelect} onClose={vi.fn()} />)
    await userEvent.click(screen.getByLabelText(/fermer/i))
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('renders badge content from renderBadge next to the label', () => {
    render(
      <FlightTabStrip
        branches={[{ id: 'b1', label: 'LFPN' }]}
        activeId="b1"
        onSelect={vi.fn()}
        renderBadge={id => <span>badge-{id}</span>}
      />
    )
    expect(screen.getByText('badge-b1')).toBeInTheDocument()
  })
})
