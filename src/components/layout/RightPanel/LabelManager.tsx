import { useState } from 'react'
import { useLabelStore } from '../../../store/labelStore'
import { useAnnotationStore } from '../../../store/annotationStore'
import { useUIStore } from '../../../store/uiStore'
import { useImageStore } from '../../../store/imageStore'
import { imageApi, labelApi } from '../../../api/ipc'
import { useI18n } from '../../../i18n'

const PRESET_COLORS = [
  '#EF4444', '#F97316', '#EAB308', '#22C55E', '#3B82F6',
  '#8B5CF6', '#EC4899', '#14B8A6', '#F43F5E', '#84CC16',
]

export default function LabelManager() {
  const { labels, createLabel, updateLabel, deleteLabel } = useLabelStore()
  const selectedAnnotationId = useAnnotationStore((s) => s.selectedId)
  const updateAnnotationLabel = useAnnotationStore((s) => s.updateLabel)
  const loadForImage = useAnnotationStore((s) => s.loadForImage)
  const activeImageId = useImageStore((s) => s.activeImageId)
  const setImages = useImageStore((s) => s.setImages)
  const activeLabelClassId = useUIStore((s) => s.activeLabelClassId)
  const setActiveLabelClassId = useUIStore((s) => s.setActiveLabelClassId)
  const { t } = useI18n()
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState(PRESET_COLORS[0])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [deleteCandidate, setDeleteCandidate] = useState<{ id: string; name: string; count: number } | null>(null)

  const handleCreate = async () => {
    if (!newName.trim()) return
    await createLabel(newName.trim(), newColor)
    setNewName('')
    setNewColor(PRESET_COLORS[labels.length % PRESET_COLORS.length] ?? PRESET_COLORS[0])
  }

  const handleStartEdit = (id: string, name: string) => {
    setEditingId(id)
    setEditName(name)
  }

  const handleSaveEdit = async (id: string) => {
    if (editName.trim()) {
      await updateLabel(id, { name: editName.trim() })
    }
    setEditingId(null)
  }

  const handleColorChange = async (id: string, color: string) => {
    await updateLabel(id, { color })
  }

  const handlePickLabel = async (labelId: string) => {
    setActiveLabelClassId(labelId)
    if (selectedAnnotationId) {
      await updateAnnotationLabel(selectedAnnotationId, labelId)
    }
  }

  const handleDeleteLabel = async (labelId: string) => {
    await deleteLabel(labelId)
    const images = await imageApi.list()
    setImages(images)
    if (activeImageId) {
      await loadForImage(activeImageId)
    }
  }

  const handleRequestDeleteLabel = async (labelId: string, labelName: string) => {
    const usageCount = await labelApi.getUsageCount(labelId)
    if (usageCount > 0) {
      setDeleteCandidate({ id: labelId, name: labelName, count: usageCount })
      return
    }
    await handleDeleteLabel(labelId)
  }

  return (
    <div style={{ height: '100%', overflow: 'auto' }}>
      {/* Add label form */}
      <div style={{
        padding: '10px',
        borderBottom: '1px solid var(--border)',
        background: labels.length === 0 ? 'rgba(var(--accent-rgb),0.08)' : 'transparent',
        boxShadow: labels.length === 0 ? 'inset 0 0 0 1px rgba(var(--accent-rgb),0.18)' : 'none',
      }}>
        <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            placeholder={t('labelManager.placeholder')}
            autoFocus={labels.length === 0}
            style={{
              flex: 1,
              fontSize: 12,
              padding: '7px 10px',
              borderRadius: 8,
              border: labels.length === 0 ? '1px solid rgba(var(--accent-rgb),0.45)' : '1px solid var(--border)',
              boxShadow: labels.length === 0 ? '0 0 0 3px rgba(var(--accent-rgb),0.14)' : 'none',
              background: 'var(--bg-secondary)',
              color: 'var(--text-primary)',
            }}
          />
        </div>
        {labels.length === 0 && (
          <div style={{ marginBottom: 8, fontSize: 11, color: 'var(--accent)', lineHeight: 1.5 }}>
            {t('labelManager.emptyHint')}
          </div>
        )}
        {/* Color presets */}
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 8 }}>
          {PRESET_COLORS.map((c) => (
            <button
              key={c}
              onClick={() => setNewColor(c)}
              onMouseDown={(e) => e.stopPropagation()}
              style={{
                width: 20, height: 20, borderRadius: '50%',
                background: c,
                border: `2px solid ${newColor === c ? 'white' : 'transparent'}`,
              }}
            />
          ))}
        </div>
        <button
          onClick={handleCreate}
          disabled={!newName.trim()}
          style={{
            width: '100%', padding: '6px', borderRadius: 5, fontSize: 12,
            background: 'var(--accent)', color: 'white', fontWeight: 600,
            opacity: !newName.trim() ? 0.5 : 1,
          }}
        >
          {t('labelManager.add')}
        </button>
      </div>

      {/* Label list */}
      <div style={{ padding: '6px 0' }}>
        {labels.length === 0 && (
          <div style={{ padding: '16px', color: 'var(--text-muted)', fontSize: 12, lineHeight: 1.6 }}>
            <div style={{ color: 'var(--text-primary)', fontWeight: 600, marginBottom: 8 }}>
              {t('labelManager.emptyTitle')}
            </div>
            <div>{t('labelManager.emptyStep1')}</div>
            <div>{t('labelManager.emptyStep2')}</div>
            <div>{t('labelManager.emptyStep3')}</div>
          </div>
        )}

        {labels.map((label, idx) => (
          <div
            key={label.id}
            onClick={() => handlePickLabel(label.id).catch(console.error)}
            style={{
              padding: '6px 10px',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              cursor: 'pointer',
              background: activeLabelClassId === label.id ? 'var(--bg-hover)' : 'transparent',
            }}
          >
            {/* Color swatch / picker — click to open full color picker */}
            <div style={{ position: 'relative' }}>
              <input
                type="color"
                value={label.color}
                onChange={(e) => handleColorChange(label.id, e.target.value)}
                onClick={(e) => e.stopPropagation()}
                title={t('labelManager.changeColor')}
                style={{
                  width: 18, height: 18, borderRadius: '50%',
                  border: '1px solid rgba(255,255,255,0.2)',
                  background: label.color,
                  cursor: 'pointer', padding: 0,
                  appearance: 'none', WebkitAppearance: 'none',
                  overflow: 'hidden',
                  opacity: 0, position: 'absolute', inset: 0,
                }}
              />
              <div
                style={{
                  width: 18, height: 18, borderRadius: '50%',
                  background: label.color,
                  border: '2px solid rgba(255,255,255,0.25)',
                  cursor: 'pointer', pointerEvents: 'none',
                }}
              />
            </div>

            {/* Index badge */}
            <span style={{
              fontSize: 10, color: 'var(--text-muted)',
              fontFamily: 'monospace', minWidth: 14,
            }}>
              {idx + 1 <= 9 ? idx + 1 : ''}
            </span>

            {/* Name */}
            {editingId === label.id ? (
              <input
                autoFocus
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onBlur={() => handleSaveEdit(label.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSaveEdit(label.id)
                  if (e.key === 'Escape') setEditingId(null)
                }}
                style={{ flex: 1, fontSize: 12, padding: '2px 6px' }}
              />
            ) : (
              <span
                style={{
                  flex: 1, fontSize: 12, color: 'var(--text-primary)',
                  cursor: 'pointer', whiteSpace: 'nowrap',
                  overflow: 'hidden', textOverflow: 'ellipsis',
                }}
                onDoubleClick={() => handleStartEdit(label.id, label.name)}
              >
                {label.name}
              </span>
            )}

            {/* Color picker inline — all presets */}
            <div style={{ display: 'flex', gap: 2, flexWrap: 'wrap', maxWidth: 64 }}>
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => handleColorChange(label.id, c)}
                  onMouseDown={(e) => e.stopPropagation()}
                  title={c}
                  style={{
                    width: 10, height: 10, borderRadius: '50%',
                    background: c,
                    border: `1px solid ${label.color === c ? 'white' : 'transparent'}`,
                  }}
                />
              ))}
            </div>

            {/* Delete */}
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    handleRequestDeleteLabel(label.id, label.name).catch(console.error)
                  }}
              style={{ padding: '2px 5px', fontSize: 11, color: 'var(--text-muted)', opacity: 0.7 }}
              title={t('labelManager.delete')}
            >
              ×
            </button>
          </div>
        ))}
      </div>

      {deleteCandidate && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            background: 'rgba(0,0,0,0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
          onClick={() => setDeleteCandidate(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 'min(420px, calc(100vw - 32px))',
              padding: 20,
              borderRadius: 16,
              border: '1px solid var(--border)',
              background: 'var(--bg-secondary)',
              boxShadow: 'var(--shadow-lg)',
            }}
          >
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>
              {t('labelManager.deleteWarningTitle')}
            </div>
            <div style={{ marginTop: 10, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.65 }}>
              {deleteCandidate.name}
            </div>
            <div style={{ marginTop: 6, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.65 }}>
              {t('labelManager.deleteWarningMessage', {
                count: deleteCandidate.count,
                suffix: deleteCandidate.count === 1 ? '' : 's',
              })}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 18 }}>
              <button
                onClick={() => setDeleteCandidate(null)}
                style={{
                  minWidth: 86,
                  height: 36,
                  borderRadius: 10,
                  border: '1px solid var(--border)',
                  background: 'var(--bg-tertiary)',
                  color: 'var(--text-primary)',
                  fontSize: 12,
                  fontWeight: 700,
                }}
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={() => {
                  handleDeleteLabel(deleteCandidate.id).catch(console.error)
                  setDeleteCandidate(null)
                }}
                style={{
                  minWidth: 112,
                  height: 36,
                  borderRadius: 10,
                  border: 'none',
                  background: '#dc2626',
                  color: 'white',
                  fontSize: 12,
                  fontWeight: 700,
                }}
              >
                {t('labelManager.deleteConfirm')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
