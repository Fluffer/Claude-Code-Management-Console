/**
 * Typed mock for window.ccmc — installs a fake preload bridge for renderer component tests.
 *
 * Usage:
 *   import { installMockCcmc, setChannelResponse } from '../mockCcmc'
 *
 *   beforeEach(() => installMockCcmc())
 *   setChannelResponse('config:read', { ... })
 */
import { vi } from 'vitest'
import type { IpcMap, IpcEvents } from '../../src/shared/ipc'

type ChannelStubs = Partial<{
  [C in keyof IpcMap]: IpcMap[C]['res']
}>

type EventListeners = Partial<{
  [E in keyof IpcEvents]: Array<(payload: IpcEvents[E]) => void>
}>

let _stubs: ChannelStubs = {}
let _listeners: EventListeners = {}

/** Install a fresh window.ccmc mock. Call in beforeEach. */
export function installMockCcmc(): void {
  _stubs = {}
  _listeners = {}

  const invoke = vi.fn(
    async <C extends keyof IpcMap>(
      channel: C,
      ..._args: IpcMap[C]['req'] extends void ? [] : [req: IpcMap[C]['req']]
    ): Promise<IpcMap[C]['res']> => {
      const stub = _stubs[channel]
      if (stub !== undefined) return stub as IpcMap[C]['res']
      throw new Error(`[mockCcmc] No stub for channel "${String(channel)}"`)
    },
  )

  const on = vi.fn(
    <E extends keyof IpcEvents>(
      event: E,
      listener: (payload: IpcEvents[E]) => void,
    ): (() => void) => {
      if (!_listeners[event]) {
        (_listeners as Record<string, unknown[]>)[event as string] = []
      }
      ;(_listeners[event] as typeof listener[]).push(listener)
      return () => {
        const arr = _listeners[event] as typeof listener[] | undefined
        if (arr) {
          const idx = arr.indexOf(listener)
          if (idx !== -1) arr.splice(idx, 1)
        }
      }
    },
  )

  // Default pathForFile: return the file name as a stand-in path (overridable per-test)
  const pathForFile = vi.fn((file: File): string => file.name)

  // @ts-expect-error -- jsdom window has no ccmc; we're adding it for tests
  window.ccmc = { invoke, on, pathForFile }
}

/** Override the response for a specific channel. */
export function setChannelResponse<C extends keyof IpcMap>(
  channel: C,
  response: IpcMap[C]['res'],
): void {
  _stubs[channel] = response
}

/** Emit a fake push event from "main". Notifies all registered listeners. */
export function emitEvent<E extends keyof IpcEvents>(
  event: E,
  payload: IpcEvents[E],
): void {
  const listeners = _listeners[event] as Array<(p: IpcEvents[E]) => void> | undefined
  if (listeners) {
    for (const l of listeners) l(payload)
  }
}

/** Return the mock invoke spy for assertion in tests. */
export function getMockInvoke(): ReturnType<typeof vi.fn> {
  // @ts-expect-error -- accessing internal mock
  return (window.ccmc as { invoke: ReturnType<typeof vi.fn> }).invoke
}

/** Return the mock pathForFile spy for assertion in tests. */
export function getMockPathForFile(): ReturnType<typeof vi.fn> {
  // @ts-expect-error -- accessing internal mock
  return (window.ccmc as { pathForFile: ReturnType<typeof vi.fn> }).pathForFile
}

/** Override pathForFile behaviour for drag-drop tests. */
export function setPathForFile(fn: (file: File) => string): void {
  // @ts-expect-error -- accessing internal mock
  ;(window.ccmc as { pathForFile: (f: File) => string }).pathForFile = fn
}
