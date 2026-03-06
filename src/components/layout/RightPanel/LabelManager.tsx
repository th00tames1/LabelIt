import { useState } from 'react'
import { useLabelStore } from '../../../store/labelStore'

const PRESET_COLORS = [
  '#EF4444', '#F97316', '#EAB308', '#22C55E', '#3B82F6',
  '#8B5CF6', '#EC4899', '#14B8A6', '#F43F5E', '#84CC16',
]

export default function LabelManager() {
  const { labels, createLabel, updateLabel, deleteLabel } = useLabelStore()
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState(PRESET_COLORS[0])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')

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

  return (
    <div style={{ height: '100%', overflow: 'auto' }}>
      {/* Add label form */}
      <div style={{
        padding: '10px',
        borderBottom: '1px solid var(--border)',
      }}>
        <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            placeholder="Label name..."
            style={{ flex: 1, fontSize: 12, padding: '5px 8px' }}
          />
        </div>
        {/* Color presets */}
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 8 }}>
          {PRESET_COLORS.map((c) => (
            <button
              key={c}
              onClick={() => setNewColor(c)}
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
          + Add Label
        </button>
      </div>

      {/* Label list */}
      <div style={{ padding: '6px 0' }}>
        {labels.length === 0 && (
          <div style={{ padding: '16px', color: 'var(--text-muted)', fontSize: 12, textAlign: 'center' }}>
            No labels yet.
          </div>
        )}

        {labels.map((label, idx) => (
          <div
            key={label.id}
            style={{
              padding: '6px 10px',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            {/* Color swatch / picker */}
            <div style={{ position: 'relative' }}>
              <div
                style={{
                  width: 16, height: 16, borderRadius: '50%',
                  background: label.color, cursor: 'pointer',
                  border: '1px solid rgba(255,255,255,0.2)',
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

            {/* Color picker inline */}
            <div style={{ display: 'flex', gap: 3 }}>
              {PRESET_COLORS.slice(0, 5).map((c) => (
                <button
                  key={c}
                  onClick={() => handleColorChange(label.id, c)}
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
              onClick={() => deleteLabel(label.id)}
              style={{ padding: '2px 5px', fontSize: 11, color: 'var(--text-muted)', opacity: 0.7 }}
              title="Delete label"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
