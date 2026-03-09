/**
 * LabelQuickPick — popup that appears after drawing an annotation.
 * Shows the label list so the user can immediately assign a class.
 * Roboflow-style workflow: draw → label picker → confirm.
 */
import { useEffect, useRef } from 'react'
import { useLabelStore } from '../store/labelStore'
import { useAnnotationStore } from '../store/annotationStore'
import { useUIStore } from '../store/uiStore'
import { useI18n } from '../i18n'

interface Props {
  annotationId: string
  onDismiss: () => void
}

export default function LabelQuickPick({ annotationId, onDismiss }: Props) {
  const { labels } = useLabelStore()
  const { updateLabel } = useAnnotationStore()
  const { activeLabelClassId, setActiveLabelClassId } = useUIStore()
  const { t } = useI18n()
  const containerRef = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onDismiss()
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onDismiss])

  // Close on Escape, accept on Enter, number keys 1-9 pick label
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onDismiss(); return }
      // Enter: confirm currently active label (or first label if none)
      if (e.key === 'Enter') {
        e.preventDefault()
        const confirmLabel = labels.find((l) => l.id === activeLabelClassId) ?? labels[0]
        if (confirmLabel) {
          setActiveLabelClassId(confirmLabel.id)
          updateLabel(annotationId, confirmLabel.id).catch(console.error)
        }
        onDismiss()
        return
      }
      // Number keys 1-9 pick label by index
      const digit = parseInt(e.key)
      if (digit >= 1 && digit <= 9 && labels[digit - 1]) {
        e.preventDefault()
        const label = labels[digit - 1]
        setActiveLabelClassId(label.id)
        updateLabel(annotationId, label.id).catch(console.error)
        onDismiss()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [annotationId, labels, activeLabelClassId, setActiveLabelClassId, updateLabel, onDismiss])

  const pick = (labelId: string) => {
    setActiveLabelClassId(labelId)
    updateLabel(annotationId, labelId).catch(console.error)
    onDismiss()
  }

  return (
    <div
      ref={containerRef}
      style={{
        position: 'fixed',
        bottom: 80,
        left: '50%',
        transform: 'translateX(-50%)',
        background: '#1a1a2e',
        border: '1px solid #3f3f5a',
        borderRadius: 8,
        padding: '8px 4px',
        zIndex: 9999,
        boxShadow: '0 4px 24px rgba(0,0,0,0.6)',
        minWidth: 200,
        maxWidth: 320,
      }}
    >
      <div style={{
        fontSize: 11, color: '#888', textAlign: 'center',
        marginBottom: 6, paddingBottom: 6,
        borderBottom: '1px solid #2a2a3e',
        letterSpacing: '0.05em', textTransform: 'uppercase',
      }}>
        {t('quickPick.title')}
        <span style={{ color: '#555', fontWeight: 400, textTransform: 'none', letterSpacing: 0, marginLeft: 6 }}>
          {`· ${t('quickPick.help')}`}
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {labels.map((label, i) => {
          const isActive = label.id === activeLabelClassId
          return (
            <button
              key={label.id}
              onClick={() => pick(label.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '5px 10px',
                background: isActive ? '#2a2a4e' : 'transparent',
                border: 'none', borderRadius: 4, cursor: 'pointer',
                color: '#ddd', fontSize: 13, textAlign: 'left',
                transition: 'background 0.1s',
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = '#2a2a4e' }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = isActive ? '#2a2a4e' : 'transparent' }}
            >
              <span style={{
                width: 10, height: 10, borderRadius: '50%',
                background: label.color, flexShrink: 0,
              }} />
              <span style={{ flex: 1 }}>{label.name}</span>
              {i < 9 && (
                <span style={{ fontSize: 10, color: '#555', marginLeft: 4 }}>{i + 1}</span>
              )}
            </button>
          )
        })}
        {labels.length === 0 && (
          <div style={{ padding: '6px 10px', color: '#555', fontSize: 12 }}>
            {t('quickPick.empty')}
          </div>
        )}
      </div>
    </div>
  )
}
