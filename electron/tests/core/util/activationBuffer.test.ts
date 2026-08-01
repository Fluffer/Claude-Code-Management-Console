import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createActivationBuffer } from '../../../src/core/util/activationBuffer'
import type { ActivationSink } from '../../../src/core/util/activationBuffer'

describe('ActivationBuffer', () => {
  let sendDeepLink: ReturnType<typeof vi.fn>
  let sendOpenPalette: ReturnType<typeof vi.fn>
  let sink: ActivationSink

  beforeEach(() => {
    sendDeepLink = vi.fn()
    sendOpenPalette = vi.fn()
    sink = { sendDeepLink, sendOpenPalette }
  })

  it('BufferThenReady_FlushesDeepLinkFirst', () => {
    const buf = createActivationBuffer(sink)
    buf.deliverDeepLink('ccmc://launch?project=foo')
    expect(sendDeepLink).not.toHaveBeenCalled()
    buf.setReady()
    expect(sendDeepLink).toHaveBeenCalledOnce()
    expect(sendDeepLink).toHaveBeenCalledWith('ccmc://launch?project=foo', false)
  })

  it('BufferThenReady_FlushesPaletteAfterDeepLink', () => {
    const buf = createActivationBuffer(sink)
    buf.deliverDeepLink('ccmc://launch?project=bar')
    buf.deliverOpenPalette()
    const callOrder: string[] = []
    sendDeepLink.mockImplementation(() => callOrder.push('deepLink'))
    sendOpenPalette.mockImplementation(() => callOrder.push('palette'))
    buf.setReady()
    expect(callOrder).toEqual(['deepLink', 'palette'])
  })

  it('DeliverAfterReady_IsImmediate_DeepLink', () => {
    const buf = createActivationBuffer(sink)
    buf.setReady()
    buf.deliverDeepLink('ccmc://launch?project=baz')
    expect(sendDeepLink).toHaveBeenCalledOnce()
    expect(sendDeepLink).toHaveBeenCalledWith('ccmc://launch?project=baz', false)
  })

  it('DeliverAfterReady_IsImmediate_Palette', () => {
    const buf = createActivationBuffer(sink)
    buf.setReady()
    buf.deliverOpenPalette()
    expect(sendOpenPalette).toHaveBeenCalledOnce()
  })

  it('PaletteAndDeepLinkBothBuffered_BothFlushed', () => {
    const buf = createActivationBuffer(sink)
    buf.deliverOpenPalette()
    buf.deliverDeepLink('ccmc://launch?project=qux')
    expect(sendOpenPalette).not.toHaveBeenCalled()
    expect(sendDeepLink).not.toHaveBeenCalled()
    buf.setReady()
    expect(sendDeepLink).toHaveBeenCalledOnce()
    expect(sendOpenPalette).toHaveBeenCalledOnce()
  })

  it('LastDeepLinkWins_BeforeReady', () => {
    const buf = createActivationBuffer(sink)
    buf.deliverDeepLink('ccmc://launch?project=first')
    buf.deliverDeepLink('ccmc://launch?project=second')
    buf.deliverDeepLink('ccmc://launch?project=third')
    buf.setReady()
    expect(sendDeepLink).toHaveBeenCalledOnce()
    expect(sendDeepLink).toHaveBeenCalledWith('ccmc://launch?project=third', false)
  })

  it('DoubleSetReady_SecondCallIsNoOp', () => {
    const buf = createActivationBuffer(sink)
    buf.deliverDeepLink('ccmc://launch?project=x')
    buf.setReady()
    buf.setReady()
    expect(sendDeepLink).toHaveBeenCalledOnce()
  })

  it('ReadyWithNothingBuffered_DoesNotCallSink', () => {
    const buf = createActivationBuffer(sink)
    buf.setReady()
    expect(sendDeepLink).not.toHaveBeenCalled()
    expect(sendOpenPalette).not.toHaveBeenCalled()
  })
  // The tray menu and jump list reuse this path for links the user already
  // clicked in our own UI; that trust has to survive the cold-start buffer,
  // or a tray click during startup would get second-guessed.
  it('carries the trusted flag through, immediately and via the buffer', () => {
    const buf = createActivationBuffer(sink)
    buf.setReady()
    buf.deliverDeepLink('ccmc://launch?project=tray', true)
    expect(sendDeepLink).toHaveBeenCalledWith('ccmc://launch?project=tray', true)

    sendDeepLink.mockClear()
    const cold = createActivationBuffer(sink)
    cold.deliverDeepLink('ccmc://launch?project=tray', true)
    expect(sendDeepLink).not.toHaveBeenCalled()
    cold.setReady()
    expect(sendDeepLink).toHaveBeenCalledWith('ccmc://launch?project=tray', true)
  })
})
