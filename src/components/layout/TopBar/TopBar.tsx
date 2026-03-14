import { useEffect, useState } from 'react'
import { useProjectStore } from '../../../store/projectStore'
import { useUIStore } from '../../../store/uiStore'
import { projectApi } from '../../../api/ipc'
import { useI18n } from '../../../i18n'

interface Props {
  onGoHome: () => void
  onFinish: () => void
  onAutoSplit: () => void
  onAutoLabel: () => void
}

const CONTROL_HEIGHT = 30

export default function TopBar({ onGoHome, onFinish, onAutoSplit, onAutoLabel }: Props) {
  const project = useProjectStore((s) => s.currentProject)
  const setCurrentProject = useProjectStore((s) => s.setCurrentProject)
  const updateCurrentProjectName = useProjectStore((s) => s.updateCurrentProjectName)
  const sidecarOnline = useUIStore((s) => s.sidecarOnline)
  const sidecarRuntime = useUIStore((s) => s.sidecarRuntime)
  const setShowShortcutsHelp = useUIStore((s) => s.setShowShortcutsHelp)
  const { t } = useI18n()
  const [isEditingName, setIsEditingName] = useState(false)
  const [draftName, setDraftName] = useState('')

  useEffect(() => {
    setDraftName(project?.name ?? '')
  }, [project?.name])

  const aiStatusText = !sidecarOnline
    ? t('topbar.aiOff')
    : sidecarRuntime?.acceleration === 'gpu'
      ? t('topbar.aiGpu')
      : sidecarRuntime?.acceleration === 'cpu'
        ? t('topbar.aiCpu')
        : t('topbar.aiOn')
  const aiStatusTitle = !sidecarOnline
    ? t('topbar.aiOffline')
    : sidecarRuntime != null
      ? `${aiStatusText} · ${sidecarRuntime.device_label}`
      : t('topbar.aiOn')
  const handleClose = async () => {
    await projectApi.close()
    setCurrentProject(null)
    onGoHome()
  }

  const handleSaveProjectName = async () => {
    if (!project) return
    const trimmed = draftName.trim()
    if (!trimmed) {
      setDraftName(project.name)
      setIsEditingName(false)
      return
    }
    if (trimmed === project.name) {
      setIsEditingName(false)
      return
    }
    const updated = await projectApi.updateName(trimmed)
    setCurrentProject(updated)
    updateCurrentProjectName(updated.name)
    setIsEditingName(false)
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
          minWidth: 84,
          height: CONTROL_HEIGHT,
          padding: '4px 10px',
          borderRadius: 5,
          color: 'var(--text-secondary)',
          fontSize: 13,
          background: 'none',
          flexShrink: 0,
        }}
        title={t('topbar.backHome')}
      >
        {t('topbar.home')}
      </button>

      <div style={{ width: 1, height: 24, background: 'var(--border)', margin: '0 4px' }} />

      {/* Project name */}
      {isEditingName ? (
        <input
          autoFocus
          value={draftName}
          onChange={(e) => setDraftName(e.target.value)}
          onBlur={() => handleSaveProjectName().catch(console.error)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSaveProjectName().catch(console.error)
            if (e.key === 'Escape') {
              setDraftName(project?.name ?? '')
              setIsEditingName(false)
            }
          }}
          style={{ width: 220, fontWeight: 600, fontSize: 14, padding: '4px 8px' }}
        />
      ) : (
        <button
          onClick={() => setIsEditingName(true)}
          title="Rename project"
          style={{
            padding: '4px 8px',
            borderRadius: 6,
            color: 'var(--text-primary)',
            fontWeight: 600,
            fontSize: 14,
            background: 'transparent',
          }}
        >
          {project?.name}
        </button>
      )}

      <div style={{ flex: 1 }} />

      {/* AI actions */}
      <button
        onClick={onAutoLabel}
        disabled={!sidecarOnline}
        title={sidecarOnline ? t('topbar.autoLabelTitle') : t('topbar.aiOffline')}
        style={{
          width: 114, height: CONTROL_HEIGHT, padding: '4px 12px', borderRadius: 5, fontSize: 12, fontWeight: 600,
          background: sidecarOnline ? 'rgba(var(--accent-rgb),0.2)' : 'var(--bg-tertiary)',
          border: `1px solid ${sidecarOnline ? 'rgba(var(--accent-rgb),0.42)' : 'var(--border)'}`,
          color: sidecarOnline ? 'var(--text-primary)' : 'var(--text-muted)',
          cursor: sidecarOnline ? 'pointer' : 'not-allowed',
          opacity: sidecarOnline ? 1 : 0.5,
          flexShrink: 0,
        }}
      >
        {`⚡ ${t('topbar.autoLabel')}`}
      </button>

      {/* Dataset actions */}
        <button
          onClick={onAutoSplit}
          title={t('topbar.autoSplitTitle')}
          style={{
          width: 72, height: CONTROL_HEIGHT, padding: '4px 10px', borderRadius: 5, fontSize: 12, fontWeight: 500,
          background: 'var(--bg-tertiary)', border: '1px solid var(--border)',
          color: 'var(--text-secondary)', cursor: 'pointer',
          flexShrink: 0,
        }}
        >
          {t('topbar.autoSplit')}
        </button>
        <button
          onClick={onFinish}
          title={t('topbar.finishTitle')}
          style={{
          width: 78, height: CONTROL_HEIGHT, padding: '4px 14px', borderRadius: 5, fontSize: 12, fontWeight: 600,
          background: 'var(--accent)', border: 'none',
          color: 'white', cursor: 'pointer',
          flexShrink: 0,
        }}
        >
          {t('topbar.finish')}
        </button>

      {/* Help button */}
        <button
          onClick={() => setShowShortcutsHelp(true)}
          title={t('topbar.shortcutsTitle')}
          style={{
          width: 32, height: CONTROL_HEIGHT, padding: '4px 8px', borderRadius: 5, fontSize: 13, fontWeight: 700,
          background: 'var(--bg-tertiary)', border: '1px solid var(--border)',
          color: 'var(--text-muted)', cursor: 'pointer',
          flexShrink: 0,
        }}
      >
        {t('topbar.shortcuts')}
      </button>

      {/* AI status */}
      <div
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, minWidth: 84, flexShrink: 0 }}
        title={aiStatusTitle}
      >
        <div style={{
          width: 8, height: 8, borderRadius: '50%',
          background: sidecarOnline ? 'var(--success)' : '#555',
        }} />
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          {aiStatusText}
        </span>
      </div>
    </div>
  )
}
