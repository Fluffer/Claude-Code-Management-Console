import { act } from '@testing-library/react'

/**
 * Lets a component's pending load effect resolve inside act().
 *
 * Tests that assert on initial render state ("renders the dialog title",
 * "starts in loading state") are asserting the right thing, but the load
 * effect they raced then resolves after the test body returns — outside act()
 * — and React logs "an update was not wrapped in act(...)". Awaiting this at
 * the end of such a test settles the effect where React expects it.
 *
 * Two ticks: one for the IPC promise, one for the state update it schedules.
 */
export async function settle(): Promise<void> {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}
