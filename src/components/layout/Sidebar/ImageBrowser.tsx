import { useCallback, useRef, useState, useEffect } from 'react'
import { FixedSizeList as List } from 'react-window'
import { imageApi } from '../../../api/ipc'
import { useImageStore } from '../../../store/imageStore'
import { useUIStore } from '../../../store/uiStore'
import type { Image, ImageStatus, SplitType } from '../../../types'

const ITEM_HEIGHT = 76
const SIDEBAR_WIDTH = 200

interface Props {
  images: Image[]
  activeImageId: string | null
  onSelectImage: (id: string) => void
  onImportComplete: (images: Image[]) => void
}

interface ContextMenu {
  imageId: string
  x: number
  y: number
}

interface ItemData {
  images: Image[]
  activeImageId: string | null
  onSelectImage: (id: string) => void
  onContextMenu: (imageId: string, x: number, y: number) => void
}

const STATUS_OPTIONS: { value: ImageStatus; label: string; color: string }[] = [
  { value: 'unlabeled', label: 'Unlabeled', color: '#6b7280' },
  { value: 'in_progress', label: 'In Progress', color: '#f59e0b' },
  { value: 'labeled', label: 'Labeled', color: '#22c55e' },
  { value: 'approved', label: 'Approved', color: '#3b82f6' },
]

const SPLIT_OPTIONS: { value: SplitType; label: string; color: string }[] = [
  { value: 'train', label: 'Train', color: '#8b5cf6' },
  { value: 'val', label: 'Val', color: '#06b6d4' },
  { value: 'test', label: 'Test', color: '#f97316' },
  { value: 'unassigned', label: 'Unassigned', color: '#6b7280' },
]

function ImageItem({
  index, style, data,
}: {
  index: number
  style: React.CSSProperties
  data: ItemData
}) {
  const image = data.images[index]
  const isActive = image.id === data.activeImageId

  const statusColor: Record<string, string> = {
    unlabeled: '#6b7280',
    in_progress: '#f59e0b',
    labeled: '#22c55e',
    approved: '#3b82f6',
  }

  const splitBadge: Record<string, { label: string; color: string }> = {
    train: { label: 'T', color: '#8b5cf6' },
    val: { label: 'V', color: '#06b6d4' },
    test: { label: 'E', color: '#f97316' },
    unassigned: { label: '-', color: '#6b7280' },
  }

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    data.onContextMenu(image.id, e.clientX, e.clientY)
  }

  const badge = splitBadge[image.split] ?? splitBadge.unassigned

  return (
    <div
      style={{ ...style, padding: '4px 6px', cursor: 'pointer' }}
      onClick={() => data.onSelectImage(image.id)}
      onContextMenu={handleContextMenu}
    >
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 8px',
        borderRadius: 6,
        background: isActive ? 'var(--bg-hover)' : 'transparent',
        border: `1px solid ${isActive ? 'var(--accent)' : 'transparent'}`,
        height: ITEM_HEIGHT - 8,
      }}>
        {/* Thumbnail */}
        <div style={{
          width: 48,
          height: 48,
          borderRadius: 4,
          overflow: 'hidden',
          flexShrink: 0,
          background: 'var(--bg-primary)',
          position: 'relative',
        }}>
          {image.thumbnail_path ? (
            <img
              src={`file://${image.thumbnail_path}`}
              alt={image.filename}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              loading="lazy"
            />
          ) : (
            <div style={{
              width: '100%', height: '100%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#444', fontSize: 10,
            }}>IMG</div>
          )}
          {/* Split badge overlay */}
          <div style={{
            position: 'absolute', bottom: 1, right: 1,
            width: 14, height: 14, borderRadius: 3,
            background: badge.color,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 8, fontWeight: 700, color: 'white',
          }}>
            {badge.label}
          </div>
        </div>

        {/* Info */}
        <div style={{ flex: 1, overflow: 'hidden' }}>
          <div style={{
            fontSize: 11, fontWeight: 500,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            color: 'var(--text-primary)',
          }}>
            {image.filename}
          </div>
          <div style={{
            fontSize: 10, color: 'var(--text-muted)', marginTop: 2,
          }}>
            {image.width}×{image.height}
          </div>
          {/* Status */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
            <div style={{
              width: 6, height: 6, borderRadius: '50%',
              background: statusColor[image.status] ?? '#555',
            }} />
            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{image.status}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function ImageBrowser({ images, activeImageId, onSelectImage, onImportComplete }: Props) {
  const setImages = useImageStore((s) => s.setImages)
  const updateImageInList = useImageStore((s) => s.updateImageInList)
  const setImporting = useUIStore((s) => s.setImporting)
  const isImporting = useUIStore((s) => s.isImporting)
  const dropRef = useRef<HTMLDivElement>(null)
  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null)

  // Close context menu on outside click
  useEffect(() => {
    if (!contextMenu) return
    const close = () => setContextMenu(null)
    window.addEventListener('click', close)
    window.addEventListener('contextmenu', close)
    return () => {
      window.removeEventListener('click', close)
      window.removeEventListener('contextmenu', close)
    }
  }, [contextMenu])

  const handleContextMenu = useCallback((imageId: string, x: number, y: number) => {
    setContextMenu({ imageId, x, y })
  }, [])

  const handleSetStatus = async (status: ImageStatus) => {
    if (!contextMenu) return
    await imageApi.updateStatus(contextMenu.imageId, status)
    const img = await imageApi.get(contextMenu.imageId)
    if (img) updateImageInList(img)
    setContextMenu(null)
  }

  const handleSetSplit = async (split: SplitType) => {
    if (!contextMenu) return
    await imageApi.updateSplit(contextMenu.imageId, split)
    const img = await imageApi.get(contextMenu.imageId)
    if (img) updateImageInList(img)
    setContextMenu(null)
  }

  const handleImportFiles = useCallback(async () => {
    const filePaths = await imageApi.showOpenDialog()
    if (!filePaths) return
    setImporting(true)
    await imageApi.import(filePaths)
    const updated = await imageApi.list()
    setImages(updated)
    onImportComplete(updated)
    setImporting(false)
  }, [setImages, setImporting, onImportComplete])

  const handleImportFolder = useCallback(async () => {
    const folderPath = await imageApi.showFolderDialog()
    if (!folderPath) return
    setImporting(true)
    await imageApi.importFolder(folderPath)
    const updated = await imageApi.list()
    setImages(updated)
    onImportComplete(updated)
    setImporting(false)
  }, [setImages, setImporting, onImportComplete])

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    const files = Array.from(e.dataTransfer.files)
      .filter((f) => /\.(jpg|jpeg|png|bmp|webp|tiff|tif)$/i.test(f.name))
      .map((f) => (f as File & { path: string }).path)
    if (files.length === 0) return
    setImporting(true)
    await imageApi.import(files)
    const updated = await imageApi.list()
    setImages(updated)
    onImportComplete(updated)
    setImporting(false)
  }, [setImages, setImporting, onImportComplete])

  const itemData: ItemData = { images, activeImageId, onSelectImage, onContextMenu: handleContextMenu }

  // Context menu: find current image to show current values
  const ctxImage = contextMenu ? images.find((i) => i.id === contextMenu.imageId) : null

  const menuItem = (
    label: string,
    color: string,
    onClick: () => void,
    isCurrent: boolean,
  ) => (
    <button
      key={label}
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 7,
        width: '100%', padding: '5px 10px',
        background: isCurrent ? 'rgba(99,102,241,0.15)' : 'transparent',
        border: 'none', cursor: 'pointer', textAlign: 'left',
        color: isCurrent ? 'var(--accent)' : 'var(--text-secondary)',
        fontSize: 12,
      }}
    >
      <div style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
      {label}
      {isCurrent && <span style={{ marginLeft: 'auto', fontSize: 10, opacity: 0.7 }}>✓</span>}
    </button>
  )

  return (
    <div
      ref={dropRef}
      style={{
        width: SIDEBAR_WIDTH,
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--bg-secondary)',
        borderRight: '1px solid var(--border)',
        flexShrink: 0,
      }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
    >
      {/* Header */}
      <div style={{
        padding: '8px 10px',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
      }}>
        <div style={{ display: 'flex', gap: 4 }}>
          <button
            onClick={handleImportFiles}
            disabled={isImporting}
            style={{
              flex: 1, padding: '5px 0', borderRadius: 4, fontSize: 11,
              background: 'var(--accent)', color: 'white', fontWeight: 600,
            }}
          >
            + Images
          </button>
          <button
            onClick={handleImportFolder}
            disabled={isImporting}
            style={{
              flex: 1, padding: '5px 0', borderRadius: 4, fontSize: 11,
              background: 'var(--bg-tertiary)', color: 'var(--text-secondary)',
              border: '1px solid var(--border)',
            }}
          >
            Folder
          </button>
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          {images.length} image{images.length !== 1 ? 's' : ''}
          {isImporting && ' · importing...'}
        </div>
      </div>

      {/* Image list */}
      {images.length > 0 ? (
        <List
          height={window.innerHeight - 100}
          itemCount={images.length}
          itemSize={ITEM_HEIGHT}
          width={SIDEBAR_WIDTH}
          itemData={itemData}
          style={{ flex: 1 }}
        >
          {ImageItem}
        </List>
      ) : (
        <div style={{
          flex: 1, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          padding: 16, textAlign: 'center',
        }}>
          <div style={{ color: 'var(--text-muted)', fontSize: 12, lineHeight: 1.5 }}>
            Drop images here or use the buttons above
          </div>
        </div>
      )}

      {/* Right-click context menu */}
      {contextMenu && ctxImage && (
        <div
          style={{
            position: 'fixed',
            left: contextMenu.x, top: contextMenu.y,
            zIndex: 9000,
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
            minWidth: 160,
            overflow: 'hidden',
            padding: '4px 0',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div style={{ padding: '4px 10px 6px', fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.06em' }}>
            STATUS
          </div>
          {STATUS_OPTIONS.map((s) =>
            menuItem(s.label, s.color, () => handleSetStatus(s.value), ctxImage.status === s.value)
          )}
          <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
          <div style={{ padding: '4px 10px 6px', fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.06em' }}>
            SPLIT
          </div>
          {SPLIT_OPTIONS.map((s) =>
            menuItem(s.label, s.color, () => handleSetSplit(s.value), ctxImage.split === s.value)
          )}
        </div>
      )}
    </div>
  )
}
