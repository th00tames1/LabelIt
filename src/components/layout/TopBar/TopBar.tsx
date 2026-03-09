import { useProjectStore } from '../../../store/projectStore'
import { useUIStore } from '../../../store/uiStore'
import { useLabelStore } from '../../../store/labelStore'
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
  const activeLabelClassId = useUIStore((s) => s.activeLabelClassId)
  const annotationsVisible = useUIStore((s) => s.annotationsVisible)
  const toggleAnnotationsVisible = useUIStore((s) => s.toggleAnnotationsVisible)
  const setShowShortcutsHelp = useUIStore((s) => s.setShowShortcutsHelp)
  const labels = useLabelStore((s) => s.labels)

  const activeLabel = labels.find((l) => l.id === activeLabelClassId)

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

      {/* Active label indicator — always visible while drawing */}
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '3px 10px', borderRadius: 5,
          background: activeLabel ? `${activeLabel.color}22` : 'var(--bg-tertiary)',
          border: `1px solid ${activeLabel ? activeLabel.color + '55' : 'var(--border)'}`,
          minWidth: 120,
        }}
        title="Active label class (press 1-9 to change)"
      >
        {activeLabel ? (
          <>
            <div style={{
              width: 10, height: 10, borderRadius: '50%',
              background: activeLabel.color, flexShrink: 0,
            }} />
            <span style={{ fontSize: 12, fontWeight: 600, color: activeLabel.color, whiteSpace: 'nowrap' }}>
              {activeLabel.name}
            </span>
            <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 2 }}>
              ({labels.indexOf(activeLabel) + 1})
            </span>
          </>
        ) : (
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>No label</span>
        )}
      </div>

      <div style={{ width: 1, height: 24, background: 'var(--border)', margin: '0 4px' }} />

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

      {/* Annotation visibility toggle */}
      <button
        onClick={toggleAnnotationsVisible}
        title={`${annotationsVisible ? 'Hide' : 'Show'} annotations (H)`}
        style={{
          padding: '4px 10px', borderRadius: 5, fontSize: 12,
          background: annotationsVisible ? 'var(--bg-tertiary)' : 'rgba(234,179,8,0.15)',
          border: `1px solid ${annotationsVisible ? 'var(--border)' : 'rgba(234,179,8,0.5)'}`,
          color: annotationsVisible ? 'var(--text-secondary)' : '#fbbf24',
          cursor: 'pointer',
        }}
      >
        {annotationsVisible ? '👁 Show' : '🚫 Hidden'}
      </button>

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

      {/* Help button */}
      <button
        onClick={() => setShowShortcutsHelp(true)}
        title="Keyboard shortcuts (?)"
        style={{
          padding: '4px 8px', borderRadius: 5, fontSize: 13, fontWeight: 700,
          background: 'var(--bg-tertiary)', border: '1px solid var(--border)',
          color: 'var(--text-muted)', cursor: 'pointer',
        }}
      >
        ?
      </button>

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
