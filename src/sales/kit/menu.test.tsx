import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Btn } from './basic'
import { Menu } from './overlay'

let host: HTMLDivElement
let root: Root

beforeEach(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

const click = async (el: Element | null | undefined): Promise<void> => {
  await act(async () => { (el as HTMLElement).click() })
}

describe('Menu inside a clipped, scrolling column (the pipeline Move menu)', () => {
  it('is drawn on the app root, outside the column, and its items still work', async () => {
    const move = vi.fn()
    await act(async () => {
      root.render(
        <div className="sos">
          <div className="col" style={{ overflow: 'auto', height: 100 }}>
            <Menu trigger={<Btn size="xs">Move</Btn>} items={[{ label: 'Negotiation', onClick: move }]} />
          </div>
        </div>,
      )
    })
    await click(host.querySelector('button'))
    const menu = host.querySelector('[role="menu"]') as HTMLElement
    expect(menu).not.toBeNull()
    expect(menu.closest('.col')).toBeNull()
    expect(menu.parentElement?.className).toBe('sos')
    expect(menu.style.position).toBe('fixed')
    // A press inside the menu is not an outside click.
    await act(async () => { menu.querySelector('button')!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })) })
    await click(menu.querySelector('[role="menuitem"]'))
    expect(move).toHaveBeenCalledOnce()
    expect(host.querySelector('[role="menu"]')).toBeNull()
  })

  it('closes on an outside press', async () => {
    await act(async () => {
      root.render(<div className="sos"><Menu trigger={<Btn>Move</Btn>} items={[{ label: 'A' }]} /></div>)
    })
    await click(host.querySelector('button'))
    expect(host.querySelector('[role="menu"]')).not.toBeNull()
    await act(async () => { document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })) })
    expect(host.querySelector('[role="menu"]')).toBeNull()
  })

  it('outside the app root it stays inline under its trigger', async () => {
    await act(async () => { root.render(<Menu trigger={<Btn>Move</Btn>} items={[{ label: 'A' }]} />) })
    await click(host.querySelector('button'))
    const menu = host.querySelector('[role="menu"]') as HTMLElement
    expect(menu.style.position).toBe('')
    expect(menu.style.top).toBe('calc(100% + 4px)')
  })
})
