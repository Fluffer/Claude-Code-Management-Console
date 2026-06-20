/**
 * McpViewerDialog — ports McpViewerDialog.xaml + .xaml.cs.
 *
 * Read-only viewer for a project's MCP servers loaded via mcp:read.
 * Displays each server's name and transport. Close only — no edits.
 *
 * IPC: mcp:read (load).
 */
import React, { useState, useEffect } from 'react'
import { Modal } from '../../components/ui/Modal'
import { Button } from '../../components/ui/Button'
import type { McpServerInfo, ProjectInfo } from '../../../core/models'

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

  useEffect(() => {
    if (!open) return
    setServers([])
    setError(null)
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

  const footer = (
    <Button onClick={onClose} variant="subtle">
      Close
    </Button>
  )

  return (
    <Modal open={open} title={`MCP servers — ${project.name}`} onClose={onClose} footer={footer}>
      <div className="flex flex-col gap-3 min-w-[340px]">
        {loading && (
          <p className="text-xs text-[var(--text-secondary)]">Loading…</p>
        )}

        {!loading && !error && servers.length === 0 && (
          <p className="text-sm text-[var(--text-secondary)]">
            No MCP servers configured in this project.
          </p>
        )}

        {!loading && servers.length > 0 && (
          <div className="flex flex-col gap-1">
            {/* Header row */}
            <div className="flex gap-3 text-xs font-medium text-[var(--text-secondary)] pb-1 border-b border-[var(--divider)]">
              <span className="flex-1">Server name</span>
              <span className="w-24">Transport</span>
            </div>
            {servers.map((server) => (
              <div key={server.name} className="flex gap-3 py-1.5 text-sm">
                <span className="flex-1 font-mono text-[var(--text-primary)] truncate" title={server.name}>
                  {server.name}
                </span>
                <span className="w-24 text-[var(--text-secondary)]">
                  {server.transport}
                </span>
              </div>
            ))}
          </div>
        )}

        {error && (
          <p role="alert" className="text-xs text-red-500">
            {error}
          </p>
        )}
      </div>
    </Modal>
  )
}
