import { useLabelStore } from '../../store/labelStore'
import { useUIStore } from '../../store/uiStore'
import { useImageStore } from '../../store/imageStore'
import { useAnnotationStore } from '../../store/annotationStore'
import { annotationApi, imageApi } from '../../api/ipc'
import { useI18n } from '../../i18n'
import type { ToolType } from '../../types'

const TOOL_SIZE = 44

interface Props {
  // Excludes the active image from the dataset and advances to a neighbor.
  // Owned by AnnotatePage because it needs navigation + annotation reload.
  onExcludeActiveImage?: () => void
}

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

  if (tool === 'polyline') {
    // Polyline icon: connected line with keypoint dots at vertices
    return (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
        <path d="M3.5 13L7 7.5L11 10.5L14.5 4.5" stroke={stroke} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="3.5" cy="13" r="1.8" fill={stroke} />
        <circle cx="7" cy="7.5" r="1.8" fill={stroke} />
        <circle cx="11" cy="10.5" r="1.8" fill={stroke} />
        <circle cx="14.5" cy="4.5" r="1.8" fill={stroke} />
      </svg>
    )
  }

  if (tool === 'keypoint') {
    // Point icon: simple crosshair / target circle for single-point placement
    return (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
        <circle cx="9" cy="9" r="3.2" stroke={stroke} strokeWidth="1.6" />
        <circle cx="9" cy="9" r="1.2" fill={stroke} />
        <line x1="9" y1="2" x2="9" y2="5.2" stroke={stroke} strokeWidth="1.5" strokeLinecap="round" />
        <line x1="9" y1="12.8" x2="9" y2="16" stroke={stroke} strokeWidth="1.5" strokeLinecap="round" />
        <line x1="2" y1="9" x2="5.2" y2="9" stroke={stroke} strokeWidth="1.5" strokeLinecap="round" />
        <line x1="12.8" y1="9" x2="16" y2="9" stroke={stroke} strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    )
  }

  if (tool === 'null') {
    return (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
        <circle cx="9" cy="9" r="6" stroke={stroke} strokeWidth="1.6" />
        <path d="M4.3 13.7L13.7 4.3" stroke={stroke} strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    )
  }

  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path d="M9 2.4L10.2 6.1L13.9 7.3L10.2 8.5L9 12.2L7.8 8.5L4.1 7.3L7.8 6.1L9 2.4Z" fill={stroke} />
      <path d="M13.8 10.5L14.4 12.4L16.3 13L14.4 13.6L13.8 15.5L13.2 13.6L11.3 13L13.2 12.4L13.8 10.5Z" fill={stroke} opacity="0.9" />
      <path d="M4.1 10.8L4.6 12.1L5.9 12.6L4.6 13.1L4.1 14.4L3.6 13.1L2.3 12.6L3.6 12.1L4.1 10.8Z" fill={stroke} opacity="0.85" />
    </svg>
  )
}

// Trash icon for the "exclude from project" action — rendered in red to mark it
// as a destructive-ish action (distinct from the neutral tool buttons).
function ExcludeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path d="M3 4.5H15" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M7 4.5V3.2C7 2.8 7.3 2.5 7.7 2.5H10.3C10.7 2.5 11 2.8 11 3.2V4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M4.5 4.5L5.2 14.2C5.25 14.9 5.8 15.5 6.5 15.5H11.5C12.2 15.5 12.75 14.9 12.8 14.2L13.5 4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M7.5 7.5V12.5M10.5 7.5V12.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}

export default function ToolRail({ onExcludeActiveImage }: Props) {
  const activeTool = useUIStore((s) => s.activeTool)
  const setActiveTool = useUIStore((s) => s.setActiveTool)
  const sidecarOnline = useUIStore((s) => s.sidecarOnline)
  const labels = useLabelStore((s) => s.labels)
  const images = useImageStore((s) => s.images)
  const activeImageId = useImageStore((s) => s.activeImageId)
  const updateImageInList = useImageStore((s) => s.updateImageInList)
  const annotations = useAnnotationStore((s) => s.annotations)
  const setAnnotations = useAnnotationStore((s) => s.setAnnotations)
  const setSelectedId = useAnnotationStore((s) => s.setSelectedId)
  const { t } = useI18n()

  const activeImage = images.find((image) => image.id === activeImageId) ?? null

  // Order: Select, BBox, Polygon, Smart Polygon, Polyline, Keypoint, No-Objects.
  // (Smart Polygon and Polyline swapped per request.)
  const items: { tool: ToolType; label: string; shortcut: string }[] = [
    { tool: 'select', label: t('topbar.selectTool'), shortcut: 'V' },
    { tool: 'bbox', label: t('topbar.bboxTool'), shortcut: 'W' },
    { tool: 'polygon', label: t('topbar.polygonTool'), shortcut: 'E' },
    { tool: 'sam', label: t('topbar.smartPolygonTool'), shortcut: 'S' },
    { tool: 'polyline', label: t('topbar.polylineTool'), shortcut: 'L' },
    { tool: 'keypoint', label: t('topbar.keypointTool'), shortcut: 'K' },
    { tool: 'null', label: t('topbar.nullTool'), shortcut: '-' },
  ]

  // Toggle the active image's "no objects" (null) flag. This is an action on the
  // image, NOT a persistent tool — it does not change the active drawing tool, so
  // the user keeps whatever tool they had as they move to the next image.
  const handleNullToggle = async () => {
    if (!activeImage) return

    if (activeImage.is_null) {
      await imageApi.updateNull(activeImage.id, false)
      const refreshed = await imageApi.get(activeImage.id)
      if (refreshed) updateImageInList(refreshed)
      return
    }

    if (annotations.length > 0) {
      await annotationApi.bulkDelete(annotations.map((annotation) => annotation.id))
      setAnnotations([])
      setSelectedId(null)
    }

    await imageApi.updateNull(activeImage.id, true)
    const refreshed = await imageApi.get(activeImage.id)
    if (refreshed) updateImageInList(refreshed)
  }

  return (
    <div
      style={{
        // Floating tool rail on the right edge of the canvas. `fitImage` reserves
        // space so the fitted image doesn't sit under it; zooming in may overlap.
        position: 'absolute',
        right: 16,
        top: '50%',
        transform: 'translateY(-50%)',
        zIndex: 6,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 8,
        padding: 8,
        borderRadius: 16,
        background: 'var(--panel-floating)',
        border: '1px solid var(--border)',
        boxShadow: 'var(--shadow-lg)',
        backdropFilter: 'blur(10px)',
        maxHeight: 'calc(100% - 32px)',
        overflowY: 'auto',
      }}
      title={t('topbar.toolRail')}
    >
      {items.map((item) => {
        const active = item.tool === 'null'
          ? (Boolean(activeImage?.is_null) || activeTool === 'null')
          : activeTool === item.tool
        // Tools require at least one class (except select/no-objects). SAM also
        // needs the sidecar. The No-Objects flag NO LONGER disables other tools —
        // clicking them simply clears it.
        const disabled = (item.tool !== 'select' && item.tool !== 'null' && labels.length === 0)
          || (item.tool === 'sam' && !sidecarOnline)

        return (
          <button
            key={item.tool}
            onClick={() => {
              if (item.tool === 'null') {
                handleNullToggle().catch(console.error)
                return
              }
              // Tool persists across images; drawing on a no-objects image clears
              // its flag automatically (handled in AnnotatePage).
              setActiveTool(item.tool)
            }}
            disabled={disabled}
            title={item.tool === 'null' ? `${item.label} — ${t('topbar.nullToolHint')}` : `${item.label} (${item.shortcut})`}
            style={{
              width: TOOL_SIZE,
              height: TOOL_SIZE,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 12,
              border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
              background: active ? 'var(--accent)' : 'var(--bg-tertiary)',
              color: active ? 'white' : 'var(--text-secondary)',
              opacity: disabled ? 0.42 : 1,
              boxSizing: 'border-box',
              cursor: disabled ? 'not-allowed' : 'pointer',
              flexShrink: 0,
            }}
          >
            <Icon tool={item.tool} active={active} />
          </button>
        )
      })}

      {/* Divider + destructive "exclude from project" action */}
      <div style={{ width: 28, height: 1, background: 'var(--border)', margin: '2px 0', flexShrink: 0 }} />
      <button
        onClick={() => onExcludeActiveImage?.()}
        disabled={!activeImage}
        title={`${t('topbar.excludeTool')} — ${t('topbar.excludeToolHint')}`}
        style={{
          width: TOOL_SIZE,
          height: TOOL_SIZE,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 12,
          border: `1px solid ${activeImage?.is_excluded ? '#ef4444' : 'rgba(239,68,68,0.5)'}`,
          background: activeImage?.is_excluded ? 'rgba(239,68,68,0.18)' : 'var(--bg-tertiary)',
          color: '#ef4444',
          opacity: activeImage ? 1 : 0.42,
          boxSizing: 'border-box',
          cursor: activeImage ? 'pointer' : 'not-allowed',
          flexShrink: 0,
        }}
      >
        <ExcludeIcon />
      </button>
    </div>
  )
}
