import { useCallback, useRef, useState, useEffect } from 'react'
import { FixedSizeList as List } from 'react-window'
import { imageApi } from '../../../api/ipc'
import { useImageStore } from '../../../store/imageStore'
import { useUIStore } from '../../../store/uiStore'
import { useI18n } from '../../../i18n'
import type { Image, ImageStatus, SplitType } from '../../../types'
import { toLocalFileUrl } from '../../../utils/paths'

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

const STATUS_OPTIONS: { value: ImageStatus; color: string }[] = [
  { value: 'unlabeled', color: 'var(--status-unlabeled)' },
  { value: 'in_progress', color: 'var(--status-in-progress)' },
  { value: 'labeled', color: 'var(--status-labeled)' },
  { value: 'approved', color: 'var(--status-approved)' },
]

const SPLIT_OPTIONS: { value: SplitType; color: string }[] = [
  { value: 'train', color: 'var(--split-train)' },
  { value: 'val', color: 'var(--split-val)' },
  { value: 'test', color: 'var(--split-test)' },
  { value: 'unassigned', color: 'var(--split-unassigned)' },
]

const selectWrapStyle: React.CSSProperties = {
  position: 'relative',
  display: 'flex',
  alignItems: 'center',
}

const selectFieldStyle: React.CSSProperties = {
  width: '100%',
  minHeight: 32,
  fontSize: 11,
  padding: '6px 28px 6px 8px',
  borderRadius: 8,
  background: 'var(--bg-tertiary)',
  color: 'var(--text-primary)',
  border: '1px solid var(--border)',
  appearance: 'none',
  WebkitAppearance: 'none',
  MozAppearance: 'none',
}

const selectArrowStyle: React.CSSProperties = {
  position: 'absolute',
  right: 10,
  top: '50%',
  transform: 'translateY(-50%)',
  color: 'var(--text-muted)',
  fontSize: 11,
  pointerEvents: 'none',
}

function ImageItem({
  index, style, data,
}: {
  index: number
  style: React.CSSProperties
  data: ItemData
}) {
  const image = data.images[index]
  const isActive = image.id === data.activeImageId
  const { language, statusLabel } = useI18n()

  const statusColor: Record<string, string> = {
    unlabeled: 'var(--status-unlabeled)',
    in_progress: 'var(--status-in-progress)',
    labeled: 'var(--status-labeled)',
    approved: 'var(--status-approved)',
  }

  const splitBadge: Record<string, { label: string; color: string }> = {
    train: { label: language === 'ko' ? '학' : 'T', color: 'var(--split-train)' },
    val: { label: language === 'ko' ? '검' : 'V', color: 'var(--split-val)' },
    test: { label: language === 'ko' ? '테' : 'E', color: 'var(--split-test)' },
    unassigned: { label: '-', color: 'var(--split-unassigned)' },
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
              src={toLocalFileUrl(image.thumbnail_path)}
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
          {/* Status + annotation count */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
           <div style={{
              width: 6, height: 6, borderRadius: '50%',
              background: statusColor[image.status] ?? '#555',
            }} />
            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{statusLabel(image.status)}</span>
            {image.annotation_count > 0 && (
              <span style={{
                marginLeft: 'auto', fontSize: 9, fontWeight: 700,
                background: 'rgba(var(--accent-rgb),0.14)', color: '#ffd7c5',
                border: '1px solid rgba(var(--accent-rgb),0.26)',
                borderRadius: 10, padding: '0px 5px',
              }}>
                {image.annotation_count}
              </span>
            )}
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
  const { t, statusLabel, splitLabel } = useI18n()
  const dropRef = useRef<HTMLDivElement>(null)
  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null)
  const activeImage = images.find((image) => image.id === activeImageId) ?? null

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

  const syncImage = useCallback(async (imageId: string) => {
    const img = await imageApi.get(imageId)
    if (img) updateImageInList(img)
  }, [updateImageInList])

  const handleUpdateStatus = useCallback(async (imageId: string, status: ImageStatus) => {
    await imageApi.updateStatus(imageId, status)
    await syncImage(imageId)
  }, [syncImage])

  const handleSetStatus = async (status: ImageStatus) => {
    if (!contextMenu) return
    await handleUpdateStatus(contextMenu.imageId, status)
    setContextMenu(null)
  }

  const handleUpdateSplit = useCallback(async (imageId: string, split: SplitType) => {
    await imageApi.updateSplit(imageId, split)
    await syncImage(imageId)
  }, [syncImage])

  const handleSetSplit = async (split: SplitType) => {
    if (!contextMenu) return
    await handleUpdateSplit(contextMenu.imageId, split)
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
        background: isCurrent ? 'rgba(var(--accent-rgb),0.14)' : 'transparent',
        border: 'none', cursor: 'pointer', textAlign: 'left',
        color: isCurrent ? '#ffd7c5' : 'var(--text-secondary)',
        fontSize: 12,
      }}
    >
      <div style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
      {label}
      {isCurrent && <span style={{ marginLeft: 'auto', fontSize: 10, opacity: 0.7 }}>✓</span>}
    </button>
  )

  const imageCountText = t('sidebar.imagesCount', {
    count: images.length,
    suffix: images.length === 1 ? '' : 's',
  })

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
              flex: 1, minHeight: 32, padding: '5px 0', borderRadius: 8, fontSize: 11,
              background: 'var(--accent)', color: 'white', fontWeight: 600,
            }}
          >
            {t('sidebar.imagesButton')}
          </button>
          <button
            onClick={handleImportFolder}
            disabled={isImporting}
            style={{
              flex: 1, minHeight: 32, padding: '5px 0', borderRadius: 8, fontSize: 11,
              background: 'var(--bg-tertiary)', color: 'var(--text-secondary)',
              border: '1px solid var(--border)',
            }}
          >
            {t('sidebar.folderButton')}
          </button>
        </div>
        <div style={{
          border: '1px solid var(--border)',
          borderRadius: 6,
          padding: '8px',
          background: 'var(--bg-primary)',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.06em', marginBottom: 4 }}>
              {t('sidebar.selectedImage')}
            </div>
            {activeImage ? (
              <>
                <div style={{
                  fontSize: 11,
                  color: 'var(--text-primary)',
                  fontWeight: 600,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}>
                  {activeImage.filename}
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                  {activeImage.width}×{activeImage.height}
                </div>
              </>
            ) : (
              <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                {t('sidebar.noImageSelected')}
              </div>
            )}
          </div>

          {activeImage && (
            <>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.06em' }}>
                  {t('sidebar.status')}
                </span>
                <div style={selectWrapStyle}>
                  <select
                    value={activeImage.status}
                    onChange={(e) => handleUpdateStatus(activeImage.id, e.target.value as ImageStatus).catch(console.error)}
                    style={selectFieldStyle}
                  >
                    {STATUS_OPTIONS.map((option) => (
                      <option
                        key={option.value}
                        value={option.value}
                        style={{ background: '#ffffff', color: '#111111' }}
                      >
                        {statusLabel(option.value)}
                      </option>
                    ))}
                  </select>
                  <span style={selectArrowStyle}>▾</span>
                </div>
              </label>

              <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.06em' }}>
                  {t('sidebar.split')}
                </span>
                <div style={selectWrapStyle}>
                  <select
                    value={activeImage.split}
                    onChange={(e) => handleUpdateSplit(activeImage.id, e.target.value as SplitType).catch(console.error)}
                    style={selectFieldStyle}
                  >
                    {SPLIT_OPTIONS.map((option) => (
                      <option
                        key={option.value}
                        value={option.value}
                        style={{ background: '#ffffff', color: '#111111' }}
                      >
                        {splitLabel(option.value)}
                      </option>
                    ))}
                  </select>
                  <span style={selectArrowStyle}>▾</span>
                </div>
              </label>

              <div style={{ fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.4 }}>
                {t('sidebar.advancedHint')}
              </div>
            </>
          )}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          {imageCountText}
          {isImporting && ` · ${t('sidebar.importing')}`}
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
            {t('sidebar.dropHint')}
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
            {t('sidebar.contextStatus')}
          </div>
          {STATUS_OPTIONS.map((s) =>
            menuItem(statusLabel(s.value), s.color, () => handleSetStatus(s.value), ctxImage.status === s.value)
          )}
          <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
          <div style={{ padding: '4px 10px 6px', fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.06em' }}>
            {t('sidebar.contextSplit')}
          </div>
          {SPLIT_OPTIONS.map((s) =>
            menuItem(splitLabel(s.value), s.color, () => handleSetSplit(s.value), ctxImage.split === s.value)
          )}
        </div>
      )}
    </div>
  )
}
