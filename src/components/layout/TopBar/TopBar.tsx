import { useProjectStore } from '../../../store/projectStore'
import { useUIStore } from '../../../store/uiStore'
import { useLabelStore } from '../../../store/labelStore'
import { projectApi } from '../../../api/ipc'
import { useI18n } from '../../../i18n'
import LanguageSwitcher from '../../LanguageSwitcher'
import type { ToolType } from '../../../types'

interface Props {
  onGoHome: () => void
  onExport: () => void
  onAutoSplit: () => void
  onAutoLabel: () => void
}

const TOOLS: { type: ToolType; labelKey: string; shortcut: string }[] = [
  { type: 'select', labelKey: 'topbar.selectTool', shortcut: 'V' },
  { type: 'bbox', labelKey: 'topbar.bboxTool', shortcut: 'W' },
  { type: 'polygon', labelKey: 'topbar.polygonTool', shortcut: 'E' },
  { type: 'keypoint', labelKey: 'topbar.keypointTool', shortcut: 'K' },
  { type: 'sam', labelKey: 'sam', shortcut: 'S' },
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
  const { t } = useI18n()

  const activeLabel = labels.find((l) => l.id === activeLabelClassId)
  const drawingLocked = labels.length === 0
  const toolButtons = TOOLS.map((tool) => {
    const label = tool.labelKey === 'sam' ? 'SAM' : t(tool.labelKey)
    const disabled = (tool.type !== 'select' && drawingLocked)
      || (tool.type === 'sam' && !sidecarOnline)
    const title = disabled
      ? drawingLocked && tool.type !== 'select'
        ? t('topbar.toolLocked')
        : t('topbar.aiOffline')
      : `${label} (${tool.shortcut})`

    return { ...tool, label, disabled, title }
  })

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
        title={t('topbar.backHome')}
      >
        {t('topbar.home')}
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
        title={drawingLocked
          ? t('topbar.activeLabelMissingTitle')
          : t('topbar.activeLabelTitle')}
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
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t('topbar.activeLabelMissing')}</span>
        )}
      </div>

      <div style={{ width: 1, height: 24, background: 'var(--border)', margin: '0 4px' }} />

      {/* Tool selector */}
      <div style={{ display: 'flex', gap: 4 }}>
        {toolButtons.map((tool) => (
          <button
            key={tool.type}
            onClick={() => setActiveTool(tool.type)}
            title={tool.title}
            style={{
              padding: '4px 10px',
              borderRadius: 5,
              fontSize: 12,
              fontWeight: 500,
              background: activeTool === tool.type ? 'var(--accent)' : 'var(--bg-tertiary)',
              color: activeTool === tool.type ? 'white' : 'var(--text-secondary)',
              border: `1px solid ${activeTool === tool.type ? 'var(--accent)' : 'var(--border)'}`,
              opacity: tool.disabled ? 0.4 : 1,
              cursor: tool.disabled ? 'not-allowed' : 'pointer',
            }}
            disabled={tool.disabled}
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
        title={annotationsVisible ? t('topbar.hideAnnotations') : t('topbar.showAnnotations')}
        style={{
          padding: '4px 10px', borderRadius: 5, fontSize: 12,
          background: annotationsVisible ? 'var(--bg-tertiary)' : 'rgba(234,179,8,0.15)',
          border: `1px solid ${annotationsVisible ? 'var(--border)' : 'rgba(234,179,8,0.5)'}`,
          color: annotationsVisible ? 'var(--text-secondary)' : '#fbbf24',
          cursor: 'pointer',
        }}
      >
        {annotationsVisible ? `👁 ${t('topbar.visibilityVisible')}` : `🚫 ${t('topbar.visibilityHidden')}`}
      </button>

      {/* AI actions */}
      <button
        onClick={onAutoLabel}
        disabled={!sidecarOnline}
        title={sidecarOnline ? t('topbar.autoLabelTitle') : t('topbar.aiOffline')}
        style={{
          padding: '4px 12px', borderRadius: 5, fontSize: 12, fontWeight: 600,
          background: sidecarOnline ? 'rgba(139,92,246,0.2)' : 'var(--bg-tertiary)',
          border: `1px solid ${sidecarOnline ? 'rgba(139,92,246,0.5)' : 'var(--border)'}`,
          color: sidecarOnline ? '#a78bfa' : 'var(--text-muted)',
          cursor: sidecarOnline ? 'pointer' : 'not-allowed',
          opacity: sidecarOnline ? 1 : 0.5,
        }}
      >
        {`⚡ ${t('topbar.autoLabel')}`}
      </button>

      {/* Dataset actions */}
        <button
          onClick={onAutoSplit}
          title={t('topbar.autoSplitTitle')}
          style={{
          padding: '4px 10px', borderRadius: 5, fontSize: 12, fontWeight: 500,
          background: 'var(--bg-tertiary)', border: '1px solid var(--border)',
          color: 'var(--text-secondary)', cursor: 'pointer',
        }}
        >
          {t('topbar.autoSplit')}
        </button>
        <button
          onClick={onExport}
          title={t('topbar.exportTitle')}
          style={{
          padding: '4px 14px', borderRadius: 5, fontSize: 12, fontWeight: 600,
          background: 'var(--accent)', border: 'none',
          color: 'white', cursor: 'pointer',
        }}
        >
          {t('topbar.export')}
        </button>

      <div style={{ width: 1, height: 24, background: 'var(--border)', margin: '0 4px' }} />

      {/* Help button */}
        <button
          onClick={() => setShowShortcutsHelp(true)}
          title={t('topbar.shortcutsTitle')}
          style={{
          padding: '4px 8px', borderRadius: 5, fontSize: 13, fontWeight: 700,
          background: 'var(--bg-tertiary)', border: '1px solid var(--border)',
          color: 'var(--text-muted)', cursor: 'pointer',
        }}
      >
        {t('topbar.shortcuts')}
      </button>

      <LanguageSwitcher compact />

      {/* AI status */}
      <div
        style={{ display: 'flex', alignItems: 'center', gap: 5 }}
        title={sidecarOnline ? t('topbar.aiOn') : t('topbar.aiOffline')}
      >
        <div style={{
          width: 8, height: 8, borderRadius: '50%',
          background: sidecarOnline ? 'var(--success)' : '#555',
        }} />
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          {sidecarOnline ? t('topbar.aiOn') : t('topbar.aiOff')}
        </span>
      </div>
    </div>
  )
}
