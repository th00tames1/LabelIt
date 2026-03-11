import { useLabelStore } from '../../store/labelStore'
import { useUIStore } from '../../store/uiStore'
import { useI18n } from '../../i18n'
import type { ToolType } from '../../types'

const TOOL_SIZE = 44

function Icon({ tool, active }: { tool: ToolType; active: boolean }) {
  const stroke = active ? 'white' : 'currentColor'

  if (tool === 'select') {
    return (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
        <path d="M3 2.5L13.2 8.8L8.4 10.2L10.6 15L8.3 16L6.1 11.2L3 14.5V2.5Z" stroke={stroke} strokeWidth="1.6" strokeLinejoin="round" />
      </svg>
    )
  }

  if (tool === 'bbox') {
    return (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
        <rect x="3" y="4" width="12" height="10" rx="1.5" stroke={stroke} strokeWidth="1.6" />
      </svg>
    )
  }

  if (tool === 'polygon') {
    return (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
        <path d="M4 6.5L8 3L14 5.8L12.4 13.5L5.2 14.3L4 6.5Z" stroke={stroke} strokeWidth="1.6" strokeLinejoin="round" />
      </svg>
    )
  }

  if (tool === 'keypoint') {
    return (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
        <path d="M5 12L8.2 8.2L11 11L13.5 5.5" stroke={stroke} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="5" cy="12" r="1.4" fill={stroke} />
        <circle cx="8.2" cy="8.2" r="1.4" fill={stroke} />
        <circle cx="11" cy="11" r="1.4" fill={stroke} />
        <circle cx="13.5" cy="5.5" r="1.4" fill={stroke} />
      </svg>
    )
  }

  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <circle cx="9" cy="9" r="5.8" stroke={stroke} strokeWidth="1.6" />
      <path d="M9 2.2V5.2M9 12.8V15.8M15.8 9H12.8M5.2 9H2.2" stroke={stroke} strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

export default function ToolRail() {
  const activeTool = useUIStore((s) => s.activeTool)
  const setActiveTool = useUIStore((s) => s.setActiveTool)
  const sidecarOnline = useUIStore((s) => s.sidecarOnline)
  const labels = useLabelStore((s) => s.labels)
  const { t } = useI18n()

  const items: { tool: ToolType; label: string; shortcut: string }[] = [
    { tool: 'select', label: t('topbar.selectTool'), shortcut: 'V' },
    { tool: 'bbox', label: t('topbar.bboxTool'), shortcut: 'W' },
    { tool: 'polygon', label: t('topbar.polygonTool'), shortcut: 'E' },
    { tool: 'keypoint', label: t('topbar.keypointTool'), shortcut: 'K' },
    { tool: 'sam', label: 'SAM', shortcut: 'S' },
  ]

  return (
    <div
      style={{
        position: 'absolute',
        right: 16,
        top: '50%',
        transform: 'translateY(-50%)',
        zIndex: 6,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        padding: 8,
        borderRadius: 16,
        background: 'var(--panel-floating)',
        border: '1px solid var(--border)',
        boxShadow: 'var(--shadow-lg)',
        backdropFilter: 'blur(10px)',
      }}
      title={t('topbar.toolRail')}
    >
      {items.map((item) => {
        const active = activeTool === item.tool
        const disabled = (item.tool !== 'select' && labels.length === 0)
          || (item.tool === 'sam' && !sidecarOnline)

        return (
          <button
            key={item.tool}
            onClick={() => setActiveTool(item.tool)}
            disabled={disabled}
            title={`${item.label} (${item.shortcut})`}
            style={{
              width: TOOL_SIZE,
              height: TOOL_SIZE,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 12,
              border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
              background: active ? 'var(--accent)' : 'var(--bg-secondary)',
              color: active ? 'white' : 'var(--text-secondary)',
              opacity: disabled ? 0.42 : 1,
              boxSizing: 'border-box',
            }}
          >
            <Icon tool={item.tool} active={active} />
          </button>
        )
      })}
    </div>
  )
}
