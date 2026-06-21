/**
 * McpViewerDialog — read-only viewer for a project's MCP servers.
 *
 * Displays each server's name + transport (mcp:read). A manual "Check health"
 * button probes every server (mcp:health) and shows ok/failed/unsupported per
 * row. Health is NEVER run automatically — probing executes the server command.
 *
 * IPC: mcp:read (load), mcp:health (manual probe).
 */
import React, { useState, useEffect } from 'react'
import { Modal } from '../../components/ui/Modal'
import { Button } from '../../components/ui/Button'
import type { McpServerInfo, HealthResult, ProjectInfo } from '../../../core/models'

export interface McpViewerDialogProps {
  open: boolean
  project: ProjectInfo
  onClose: () => void
}

export function McpViewerDialog({
  open,
  project,
  onClose,
}: McpViewerDialogProps): React.ReactElement {
  const [servers, setServers] = useState<McpServerInfo[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [health, setHealth] = useState<Record<string, HealthResult>>({})
  const [checking, setChecking] = useState(false)

  useEffect(() => {
    if (!open) return
    setServers([])
    setError(null)
    setHealth({})
    setChecking(false)
    setLoading(true)

    void window.ccmc.invoke('mcp:read', { path: project.path })
      .then((result) => {
        setServers(result)
        setLoading(false)
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : String(err))
        setLoading(false)
      })
  }, [open, project.path])

  async function checkHealth(): Promise<void> {
    if (checking) return
    setChecking(true)
    setHealth({})
    try {
      const results = await window.ccmc.invoke('mcp:health', { path: project.path })
      const map: Record<string, HealthResult> = {}
      for (const r of results) map[r.name] = r
      setHealth(map)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setChecking(false)
    }
  }

  const footer = (
    <>
      <Button
        onClick={() => void checkHealth()}
        variant="subtle"
        disabled={checking || servers.length === 0}
      >
        {checking ? 'Checking…' : 'Check health'}
      </Button>
      <Button onClick={onClose} variant="subtle">Close</Button>
    </>
  )

  return (
    <Modal open={open} title={`MCP servers — ${project.name}`} onClose={onClose} footer={footer}>
      <div className="flex flex-col gap-3 min-w-[420px]">
        {loading && <p className="text-xs text-[var(--text-secondary)]">Loading…</p>}

        {!loading && !error && servers.length === 0 && (
          <p className="text-sm text-[var(--text-secondary)]">
            No MCP servers configured in this project.
          </p>
        )}

        {!loading && servers.length > 0 && (
          <div className="flex flex-col gap-1">
            <div className="flex gap-3 text-xs font-medium text-[var(--text-secondary)] pb-1 border-b border-[var(--divider)]">
              <span className="flex-1">Server name</span>
              <span className="w-24">Transport</span>
              <span className="w-28">Health</span>
            </div>
            {servers.map((server) => {
              const h = health[server.name]
              const color =
                h?.status === 'ok' ? 'text-green-500'
                  : h?.status === 'failed' ? 'text-red-500'
                  : 'text-[var(--text-tertiary)]'
              const label = h ? h.status : checking ? '…' : '—'
              return (
                <div key={server.name} className="flex gap-3 py-1.5 text-sm">
                  <span className="flex-1 font-mono text-[var(--text-primary)] truncate" title={server.name}>
                    {server.name}
                  </span>
                  <span className="w-24 text-[var(--text-secondary)] truncate">
                    {server.transport}
                  </span>
                  <span className={`w-28 ${color}`} title={h?.detail ?? undefined}>
                    {label}
                  </span>
                </div>
              )
            })}
          </div>
        )}

        {error && <p role="alert" className="text-xs text-red-500">{error}</p>}
      </div>
    </Modal>
  )
}
