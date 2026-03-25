import { useState } from 'react'
import { useAnnotationStore } from '../../../store/annotationStore'
import { useLabelStore } from '../../../store/labelStore'
import { useImageStore } from '../../../store/imageStore'
import { yoloApi } from '../../../api/ipc'
import { useI18n } from '../../../i18n'
import type { Annotation } from '../../../types'

export default function AnnotationList() {
  const { annotations, setAnnotations, selectedId, setSelectedId, deleteAnnotation, updateLabel, undo, redo } =
    useAnnotationStore()
  const visibilityById = useAnnotationStore((s) => s.visibilityById)
  const toggleAnnotationVisible = useAnnotationStore((s) => s.toggleAnnotationVisible)
  const { labels, load: reloadLabels } = useLabelStore()
  const activeImageId = useImageStore((s) => s.activeImageId)
  const { t } = useI18n()

  // Filter state: show all or only yolo_auto
  const [filterAuto, setFilterAuto] = useState(false)
  const [openLabelPickerId, setOpenLabelPickerId] = useState<string | null>(null)

  const autoCount = annotations.filter((a) => a.source === 'yolo_auto').length

  const getLabelName = (id: string | null) => {
    if (!id) return t('annotationList.unlabeled')
    return labels.find((l) => l.id === id)?.name ?? t('annotationList.unlabeled')
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
          title={t('annotationList.undoTitle')}
        >
          {`↩ ${t('annotationList.undo')}`}
        </button>
        <button
          onClick={() => redo()}
          style={{
            flex: 1, padding: '4px', borderRadius: 4, fontSize: 11,
            background: 'var(--bg-tertiary)', border: '1px solid var(--border)',
            color: 'var(--text-secondary)', cursor: 'pointer',
          }}
          title={t('annotationList.redoTitle')}
        >
          {`↪ ${t('annotationList.redo')}`}
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
              <span style={{ fontSize: 10, color: 'var(--warning)' }}>⚡</span>
              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--warning)' }}>
                {t('annotationList.autoToReview', { count: autoCount, suffix: autoCount === 1 ? '' : 's' })}
              </span>
            </div>
            <button
              onClick={() => setFilterAuto((v) => !v)}
              style={{
                fontSize: 10, padding: '2px 7px', borderRadius: 4,
                background: filterAuto ? 'var(--warning)' : 'transparent',
                border: `1px solid ${filterAuto ? 'var(--warning)' : 'rgba(var(--warning-rgb),0.45)'}`,
                color: filterAuto ? '#20150a' : 'var(--warning)',
                cursor: 'pointer', fontWeight: 600,
              }}
            >
              {filterAuto ? t('annotationList.showAll') : t('annotationList.filter')}
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
              title={t('annotationList.acceptAllTitle')}
            >
              {`✓ ${t('annotationList.acceptAll')}`}
            </button>
            <button
              onClick={handleRejectAll}
              style={{
                flex: 1, padding: '4px 0', borderRadius: 5, fontSize: 11, fontWeight: 600,
                background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
                color: '#f87171', cursor: 'pointer',
              }}
              title={t('annotationList.rejectAllTitle')}
            >
              {`✕ ${t('annotationList.rejectAll')}`}
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
            {filterAuto ? t('annotationList.noAutoAnnotations') : t('annotationList.noAnnotations')}
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
            isVisible={visibilityById[ann.id] ?? true}
            isLabelPickerOpen={openLabelPickerId === ann.id}
            onSelect={() => setSelectedId(ann.id)}
            onDelete={() => deleteAnnotation(ann.id)}
            onToggleVisible={() => toggleAnnotationVisible(ann.id)}
            onChangeLabel={(labelId) => updateLabel(ann.id, labelId)}
            onAccept={() => handleAcceptOne(ann.id)}
            onReject={() => handleRejectOne(ann.id)}
            onToggleLabelPicker={() => setOpenLabelPickerId((current) => current === ann.id ? null : ann.id)}
            onCloseLabelPicker={() => setOpenLabelPickerId(null)}
          />
        ))}
      </div>
    </div>
  )
}

function AnnotationItem({
  annotation, isSelected, labelName, labelColor, labels,
  isVisible, onSelect, onDelete, onToggleVisible, onChangeLabel, onAccept, onReject,
  isLabelPickerOpen, onToggleLabelPicker, onCloseLabelPicker,
}: {
  annotation: Annotation
  isSelected: boolean
  labelName: string
  labelColor: string
  labels: { id: string; name: string; color: string }[]
  isVisible: boolean
  onSelect: () => void
  onDelete: () => void
  onToggleVisible: () => void
  onChangeLabel: (id: string | null) => void
  onAccept: () => void
  onReject: () => void
  isLabelPickerOpen: boolean
  onToggleLabelPicker: () => void
  onCloseLabelPicker: () => void
}) {
  const { t } = useI18n()
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
          : isAuto ? 'rgba(var(--warning-rgb),0.06)' : 'transparent',
        borderLeft: `2px solid ${isSelected ? labelColor : isAuto ? 'var(--warning)' : 'transparent'}`,
        opacity: isVisible ? 1 : 0.55,
        position: 'relative',
      }}
    >
      {/* Main row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button
          onClick={(e) => { e.stopPropagation(); onToggleVisible() }}
          style={{
            width: 24,
            height: 24,
            borderRadius: 6,
            border: '1px solid var(--border)',
            background: isVisible ? 'rgba(var(--accent-rgb),0.12)' : 'var(--bg-tertiary)',
            color: isVisible ? 'var(--accent)' : 'var(--text-muted)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
          title={isVisible ? 'Hide label' : 'Show label'}
        >
          <svg width="14" height="14" viewBox="0 0 18 18" fill="none" aria-hidden="true">
            <path d="M1.8 9C3.7 5.8 6.1 4.2 9 4.2C11.9 4.2 14.3 5.8 16.2 9C14.3 12.2 11.9 13.8 9 13.8C6.1 13.8 3.7 12.2 1.8 9Z" stroke="currentColor" strokeWidth="1.5" />
            <circle cx="9" cy="9" r="2.3" stroke="currentColor" strokeWidth="1.5" />
            {!isVisible && <path d="M3 15L15 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />}
          </svg>
        </button>

        {/* Label */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            onClick={(e) => { e.stopPropagation(); onToggleLabelPicker() }}
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
            <span style={{ fontSize: 10, color: 'var(--warning)', display: 'block', marginTop: 1 }}>
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
              title={t('annotationList.acceptTitle')}
            >✓</button>
            <button
              onClick={(e) => { e.stopPropagation(); onReject() }}
              style={{
                padding: '2px 6px', borderRadius: 4, fontSize: 10, fontWeight: 700,
                background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
                color: '#f87171', cursor: 'pointer',
              }}
              title={t('annotationList.rejectTitle')}
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
            title={t('annotationList.delete')}
          >×</button>
        )}
      </div>

      {/* Label picker dropdown */}
      {isLabelPickerOpen && (
        <div
          style={{
            position: 'absolute', right: 40, top: 0, zIndex: 50,
            background: 'var(--bg-tertiary)', border: '1px solid var(--border)',
            borderRadius: 6, padding: '4px 0', minWidth: 120, boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div
            style={{
              padding: '4px 10px', fontSize: 11, cursor: 'pointer', color: 'var(--text-primary)',
              display: 'flex', alignItems: 'center', gap: 8,
            }}
            onClick={() => { onChangeLabel(null); onCloseLabelPicker() }}
          >
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#666' }} />
            {t('annotationList.unlabeled')}
          </div>
          {labels.map((l) => (
            <div
              key={l.id}
              style={{
                padding: '4px 10px', fontSize: 11, cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 8,
                color: 'var(--text-primary)',
              }}
              onClick={() => { onChangeLabel(l.id); onCloseLabelPicker() }}
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
