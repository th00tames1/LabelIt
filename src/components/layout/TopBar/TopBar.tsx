import { useProjectStore } from '../../../store/projectStore'
import { useUIStore } from '../../../store/uiStore'
import { projectApi } from '../../../api/ipc'
import type { ToolType } from '../../../types'

interface Props {
  onGoHome: () => void
  onExport: () => void
  onAutoSplit: () => void
  onAutoLabel: () => void
}

const TOOLS: { type: ToolType; label: string; shortcut: string }[] = [
  { type: 'select', label: 'Select', shortcut: 'V' },
  { type: 'bbox', label: 'BBox', shortcut: 'W' },
  { type: 'polygon', label: 'Polygon', shortcut: 'E' },
  { type: 'keypoint', label: 'Keypoint', shortcut: 'K' },
  { type: 'sam', label: 'SAM', shortcut: 'S' },
]

export default function TopBar({ onGoHome, onExport, onAutoSplit, onAutoLabel }: Props) {
  const project = useProjectStore((s) => s.currentProject)
  const setCurrentProject = useProjectStore((s) => s.setCurrentProject)
  const activeTool = useUIStore((s) => s.activeTool)
  const setActiveTool = useUIStore((s) => s.setActiveTool)
  const sidecarOnline = useUIStore((s) => s.sidecarOnline)

  const handleClose = async () => {
    await projectApi.close()
    setCurrentProject(null)
    onGoHome()
  }

  return (
    <div style={{
      height: 48,
      background: 'var(--bg-secondary)',
      borderBottom: '1px solid var(--border)',
      display: 'flex',
      alignItems: 'center',
      padding: '0 12px',
      gap: 8,
      flexShrink: 0,
    }}>
      {/* Back button */}
      <button
        onClick={handleClose}
        style={{
          padding: '4px 10px',
          borderRadius: 5,
          color: 'var(--text-secondary)',
          fontSize: 13,
          background: 'none',
        }}
        title="Back to home"
      >
        ← Home
      </button>

      <div style={{ width: 1, height: 24, background: 'var(--border)', margin: '0 4px' }} />

      {/* Project name */}
      <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-primary)' }}>
        {project?.name}
      </span>

      <div style={{ flex: 1 }} />

      {/* Tool selector */}
      <div style={{ display: 'flex', gap: 4 }}>
        {TOOLS.map((tool) => (
          <button
            key={tool.type}
            onClick={() => setActiveTool(tool.type)}
            title={`${tool.label} (${tool.shortcut})`}
            style={{
              padding: '4px 10px',
              borderRadius: 5,
              fontSize: 12,
              fontWeight: 500,
              background: activeTool === tool.type ? 'var(--accent)' : 'var(--bg-tertiary)',
              color: activeTool === tool.type ? 'white' : 'var(--text-secondary)',
              border: `1px solid ${activeTool === tool.type ? 'var(--accent)' : 'var(--border)'}`,
              opacity: tool.type === 'sam' && !sidecarOnline ? 0.4 : 1,
              cursor: tool.type === 'sam' && !sidecarOnline ? 'not-allowed' : 'pointer',
            }}
            disabled={tool.type === 'sam' && !sidecarOnline}
          >
            {tool.label}
            <span style={{ marginLeft: 5, fontSize: 10, opacity: 0.6 }}>{tool.shortcut}</span>
          </button>
        ))}
      </div>

      <div style={{ width: 1, height: 24, background: 'var(--border)', margin: '0 4px' }} />

      {/* AI actions */}
      <button
        onClick={onAutoLabel}
        disabled={!sidecarOnline}
        title={sidecarOnline ? 'Run YOLO auto-label' : 'AI sidecar offline'}
        style={{
          padding: '4px 12px', borderRadius: 5, fontSize: 12, fontWeight: 600,
          background: sidecarOnline ? 'rgba(139,92,246,0.2)' : 'var(--bg-tertiary)',
          border: `1px solid ${sidecarOnline ? 'rgba(139,92,246,0.5)' : 'var(--border)'}`,
          color: sidecarOnline ? '#a78bfa' : 'var(--text-muted)',
          cursor: sidecarOnline ? 'pointer' : 'not-allowed',
          opacity: sidecarOnline ? 1 : 0.5,
        }}
      >
        ⚡ Auto Label
      </button>

      {/* Dataset actions */}
      <button
        onClick={onAutoSplit}
        title="Auto-split images into train/val/test"
        style={{
          padding: '4px 10px', borderRadius: 5, fontSize: 12, fontWeight: 500,
          background: 'var(--bg-tertiary)', border: '1px solid var(--border)',
          color: 'var(--text-secondary)', cursor: 'pointer',
        }}
      >
        Split
      </button>
      <button
        onClick={onExport}
        title="Export dataset"
        style={{
          padding: '4px 14px', borderRadius: 5, fontSize: 12, fontWeight: 600,
          background: 'var(--accent)', border: 'none',
          color: 'white', cursor: 'pointer',
        }}
      >
        Export
      </button>

      <div style={{ width: 1, height: 24, background: 'var(--border)', margin: '0 4px' }} />

      {/* AI status */}
      <div
        style={{ display: 'flex', alignItems: 'center', gap: 5 }}
        title={sidecarOnline ? 'AI sidecar online' : 'AI sidecar offline — SAM/auto-label unavailable'}
      >
        <div style={{
          width: 8, height: 8, borderRadius: '50%',
          background: sidecarOnline ? 'var(--success)' : '#555',
        }} />
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          AI {sidecarOnline ? 'On' : 'Off'}
        </span>
      </div>
    </div>
  )
}
