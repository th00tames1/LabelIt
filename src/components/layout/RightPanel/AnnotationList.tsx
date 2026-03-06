import { useState } from 'react'
import { useAnnotationStore } from '../../../store/annotationStore'
import { useLabelStore } from '../../../store/labelStore'
import { useImageStore } from '../../../store/imageStore'
import { yoloApi, annotationApi } from '../../../api/ipc'
import type { Annotation, AnnotationType } from '../../../types'

const TYPE_ICONS: Record<AnnotationType, string> = {
  bbox: '⬜',
  polygon: '⬟',
  polyline: '∿',
  keypoints: '⊕',
  mask: '◈',
}

export default function AnnotationList() {
  const { annotations, setAnnotations, selectedId, setSelectedId, deleteAnnotation, updateLabel, undo, redo } =
    useAnnotationStore()
  const { labels, load: reloadLabels } = useLabelStore()
  const activeImageId = useImageStore((s) => s.activeImageId)

  // Filter state: show all or only yolo_auto
  const [filterAuto, setFilterAuto] = useState(false)

  const autoCount = annotations.filter((a) => a.source === 'yolo_auto').length

  const getLabelName = (id: string | null) => {
    if (!id) return 'Unlabeled'
    return labels.find((l) => l.id === id)?.name ?? 'Unlabeled'
  }

  const getLabelColor = (id: string | null) => {
    if (!id) return '#666'
    return labels.find((l) => l.id === id)?.color ?? '#666'
  }

  // Accept all yolo_auto for current image
  const handleAcceptAll = async () => {
    if (!activeImageId) return
    await yoloApi.acceptAll(activeImageId)
    // Update local state — flip source to 'manual'
    setAnnotations(annotations.map((a) =>
      a.source === 'yolo_auto' ? { ...a, source: 'manual' } : a,
    ))
    // New label classes may have been auto-created — reload labels
    await reloadLabels()
  }

  // Reject all yolo_auto for current image
  const handleRejectAll = async () => {
    if (!activeImageId) return
    await yoloApi.rejectAll(activeImageId)
    setAnnotations(annotations.filter((a) => a.source !== 'yolo_auto'))
  }

  // Accept one
  const handleAcceptOne = async (annId: string) => {
    await yoloApi.acceptOne(annId)
    setAnnotations(annotations.map((a) =>
      a.id === annId ? { ...a, source: 'manual' } : a,
    ))
  }

  // Reject one
  const handleRejectOne = async (annId: string) => {
    await yoloApi.rejectOne(annId)
    setAnnotations(annotations.filter((a) => a.id !== annId))
  }

  // Keyboard: Delete selected, Ctrl+Z, Ctrl+Y
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Delete' && selectedId) {
      deleteAnnotation(selectedId)
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
      e.preventDefault()
      undo()
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
      e.preventDefault()
      redo()
    }
  }

  const visible = filterAuto ? annotations.filter((a) => a.source === 'yolo_auto') : annotations

  return (
    <div
      style={{ height: '100%', overflow: 'auto', outline: 'none', display: 'flex', flexDirection: 'column' }}
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      {/* Undo/Redo row */}
      <div style={{
        display: 'flex', gap: 4, padding: '8px 10px',
        borderBottom: '1px solid var(--border)',
        flexShrink: 0,
      }}>
        <button
          onClick={() => undo()}
          style={{
            flex: 1, padding: '4px', borderRadius: 4, fontSize: 11,
            background: 'var(--bg-tertiary)', border: '1px solid var(--border)',
            color: 'var(--text-secondary)', cursor: 'pointer',
          }}
          title="Undo (Ctrl+Z)"
        >
          ↩ Undo
        </button>
        <button
          onClick={() => redo()}
          style={{
            flex: 1, padding: '4px', borderRadius: 4, fontSize: 11,
            background: 'var(--bg-tertiary)', border: '1px solid var(--border)',
            color: 'var(--text-secondary)', cursor: 'pointer',
          }}
          title="Redo (Ctrl+Y)"
        >
          ↪ Redo
        </button>
      </div>

      {/* Review queue bar (only shown when there are yolo_auto annotations) */}
      {autoCount > 0 && (
        <div style={{
          flexShrink: 0,
          padding: '7px 10px',
          background: 'rgba(234,179,8,0.08)',
          borderBottom: '1px solid rgba(234,179,8,0.2)',
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            marginBottom: 6,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ fontSize: 10, color: '#fbbf24' }}>⚡</span>
              <span style={{ fontSize: 11, fontWeight: 600, color: '#fbbf24' }}>
                {autoCount} auto-label{autoCount !== 1 ? 's' : ''} to review
              </span>
            </div>
            <button
              onClick={() => setFilterAuto((v) => !v)}
              style={{
                fontSize: 10, padding: '2px 7px', borderRadius: 4,
                background: filterAuto ? '#fbbf24' : 'transparent',
                border: `1px solid ${filterAuto ? '#fbbf24' : 'rgba(251,191,36,0.4)'}`,
                color: filterAuto ? '#000' : '#fbbf24',
                cursor: 'pointer', fontWeight: 600,
              }}
            >
              {filterAuto ? 'Show all' : 'Filter'}
            </button>
          </div>
          <div style={{ display: 'flex', gap: 5 }}>
            <button
              onClick={handleAcceptAll}
              style={{
                flex: 1, padding: '4px 0', borderRadius: 5, fontSize: 11, fontWeight: 600,
                background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.4)',
                color: '#4ade80', cursor: 'pointer',
              }}
              title="Accept all — converts yolo_auto to manual annotations"
            >
              ✓ Accept All
            </button>
            <button
              onClick={handleRejectAll}
              style={{
                flex: 1, padding: '4px 0', borderRadius: 5, fontSize: 11, fontWeight: 600,
                background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
                color: '#f87171', cursor: 'pointer',
              }}
              title="Reject all — deletes all yolo_auto annotations"
            >
              ✕ Reject All
            </button>
          </div>
        </div>
      )}

      {/* Annotation list */}
      <div style={{ flex: 1, overflow: 'auto', padding: '6px 0' }}>
        {visible.length === 0 && (
          <div style={{
            padding: '20px 12px', color: 'var(--text-muted)',
            fontSize: 12, textAlign: 'center', lineHeight: 1.5,
          }}>
            {filterAuto ? 'No auto-label annotations.' : 'No annotations.\nUse tools to draw.'}
          </div>
        )}

        {visible.map((ann) => (
          <AnnotationItem
            key={ann.id}
            annotation={ann}
            isSelected={ann.id === selectedId}
            labelName={getLabelName(ann.label_class_id)}
            labelColor={getLabelColor(ann.label_class_id)}
            labels={labels}
            onSelect={() => setSelectedId(ann.id)}
            onDelete={() => deleteAnnotation(ann.id)}
            onChangeLabel={(labelId) => updateLabel(ann.id, labelId)}
            onAccept={() => handleAcceptOne(ann.id)}
            onReject={() => handleRejectOne(ann.id)}
          />
        ))}
      </div>
    </div>
  )
}

function AnnotationItem({
  annotation, isSelected, labelName, labelColor, labels,
  onSelect, onDelete, onChangeLabel, onAccept, onReject,
}: {
  annotation: Annotation
  isSelected: boolean
  labelName: string
  labelColor: string
  labels: { id: string; name: string; color: string }[]
  onSelect: () => void
  onDelete: () => void
  onChangeLabel: (id: string | null) => void
  onAccept: () => void
  onReject: () => void
}) {
  const [showLabelPicker, setShowLabelPicker] = useState(false)
  const icon = TYPE_ICONS[annotation.annotation_type] ?? '?'
  const isAuto = annotation.source === 'yolo_auto'

  return (
    <div
      onClick={onSelect}
      style={{
        padding: '6px 10px',
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        gap: 0,
        background: isSelected
          ? 'var(--bg-hover)'
          : isAuto ? 'rgba(234,179,8,0.04)' : 'transparent',
        borderLeft: `2px solid ${isSelected ? labelColor : isAuto ? '#fbbf24' : 'transparent'}`,
        position: 'relative',
      }}
    >
      {/* Main row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {/* Type icon */}
        <span style={{ fontSize: 14, flexShrink: 0 }}>{icon}</span>

        {/* Label */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            onClick={(e) => { e.stopPropagation(); setShowLabelPicker((v) => !v) }}
            style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer' }}
          >
            <div style={{
              width: 8, height: 8, borderRadius: '50%',
              background: labelColor, flexShrink: 0,
            }} />
            <span style={{
              fontSize: 11, color: 'var(--text-primary)',
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>
              {labelName}
            </span>
          </div>

          {/* Source / confidence */}
          {annotation.source !== 'manual' && (
            <span style={{ fontSize: 10, color: '#fbbf24', display: 'block', marginTop: 1 }}>
              yolo_auto{annotation.confidence != null ? ` · ${(annotation.confidence * 100).toFixed(0)}%` : ''}
            </span>
          )}
        </div>

        {/* Action buttons */}
        {isAuto ? (
          // Accept / Reject for auto-label annotations
          <>
            <button
              onClick={(e) => { e.stopPropagation(); onAccept() }}
              style={{
                padding: '2px 6px', borderRadius: 4, fontSize: 10, fontWeight: 700,
                background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.4)',
                color: '#4ade80', cursor: 'pointer',
              }}
              title="Accept — keep as manual annotation"
            >✓</button>
            <button
              onClick={(e) => { e.stopPropagation(); onReject() }}
              style={{
                padding: '2px 6px', borderRadius: 4, fontSize: 10, fontWeight: 700,
                background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
                color: '#f87171', cursor: 'pointer',
              }}
              title="Reject — delete this annotation"
            >✕</button>
          </>
        ) : (
          // Regular delete for manual annotations
          <button
            onClick={(e) => { e.stopPropagation(); onDelete() }}
            style={{
              padding: '2px 5px', borderRadius: 3, fontSize: 11,
              color: 'var(--text-muted)', opacity: 0.7, background: 'none',
              border: 'none', cursor: 'pointer',
            }}
            title="Delete"
          >×</button>
        )}
      </div>

      {/* Label picker dropdown */}
      {showLabelPicker && (
        <div
          style={{
            position: 'absolute', right: 40, top: 0, zIndex: 50,
            background: 'var(--bg-tertiary)', border: '1px solid var(--border)',
            borderRadius: 6, padding: '4px 0', minWidth: 120, boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div
            style={{ padding: '4px 10px', fontSize: 11, cursor: 'pointer', color: 'var(--text-muted)' }}
            onClick={() => { onChangeLabel(null); setShowLabelPicker(false) }}
          >
            Unlabeled
          </div>
          {labels.map((l) => (
            <div
              key={l.id}
              style={{
                padding: '4px 10px', fontSize: 11, cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 8,
                color: 'var(--text-primary)',
              }}
              onClick={() => { onChangeLabel(l.id); setShowLabelPicker(false) }}
            >
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: l.color }} />
              {l.name}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
