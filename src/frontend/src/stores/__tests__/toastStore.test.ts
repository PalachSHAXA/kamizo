import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { useToastStore } from '../toastStore'

describe('toastStore', () => {
  beforeEach(() => {
    useToastStore.setState({ toasts: [] })
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('addToast adds a toast to the list', () => {
    useToastStore.getState().addToast('success', 'Payment saved')

    const { toasts } = useToastStore.getState()
    expect(toasts).toHaveLength(1)
    expect(toasts[0].type).toBe('success')
    expect(toasts[0].message).toBe('Payment saved')
    expect(toasts[0].id).toBeDefined()
  })

  it('removeToast removes a specific toast', () => {
    useToastStore.getState().addToast('error', 'Something failed')
    const { toasts } = useToastStore.getState()
    const toastId = toasts[0].id

    useToastStore.getState().removeToast(toastId)

    expect(useToastStore.getState().toasts).toHaveLength(0)
  })

  it('auto-removes toast after 4 seconds', () => {
    useToastStore.getState().addToast('info', 'Temporary message')

    expect(useToastStore.getState().toasts).toHaveLength(1)

    // Fast-forward 4 seconds
    vi.advanceTimersByTime(4000)

    expect(useToastStore.getState().toasts).toHaveLength(0)
  })
})
