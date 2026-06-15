import { useCallback, useRef, useState, useEffect } from 'react'
import { FixedSizeList as List } from 'react-window'
import { imageApi } from '../../../api/ipc'
import { useImageStore } from '../../../store/imageStore'
import { useUIStore } from '../../../store/uiStore'
import { useI18n } from '../../../i18n'
import type { Image, ImageStatus, SplitType, ImportResult } from '../../../types'
import { toLocalFileUrl } from '../../../utils/paths'

const ITEM_HEIGHT = 76
const SIDEBAR_WIDTH = 200
type ViewStatus = ImageStatus | 'all'
type ViewSplit = SplitType | 'all'

interface Props {
  images: Image[]
  activeImageId: string | null
  onSelectImage: (id: string) => void
  onImportComplete: (images: Image[]) => Promise<void> | void
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
    labeled: 'var(--status-labeled)',
    approved: 'var(--status-approved)',
  }
  const displayStatus = image.status === 'in_progress' ? 'labeled' : image.status

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
              background: statusColor[displayStatus] ?? '#555',
            }} />
            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{statusLabel(displayStatus as ImageStatus)}</span>
            {image.annotation_count > 0 && (
              <span style={{
                marginLeft: 'auto', fontSize: 9, fontWeight: 700,
                background: 'rgba(var(--accent-rgb),0.18)', color: 'var(--text-primary)',
                border: '1px solid rgba(var(--accent-rgb),0.34)',
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

// Build a short, glanceable summary of an import — shown in a banner above the
// image list for ~7s so the user can confirm what landed.  Honours i18n keys
// for plural suffix handling.
function describeImportResult(
  result: ImportResult,
  t: (key: string, vars?: Record<string, string | number>) => string,
): { tone: 'success' | 'warning' | 'error'; message: string } | null {
  if (result.errors.length > 0 && result.imported === 0 && result.existing_images_relabeled === 0) {
    return { tone: 'error', message: t('sidebar.importDoneFailed', { message: result.errors[0] }) }
  }

  // Case A: no new images, but labels were attached to existing-but-unlabeled
  // images. This is the "drop label files into an already-imported folder"
  // workflow — surface it clearly so the user sees the relabel happened.
  if (result.imported === 0 && result.existing_images_relabeled > 0) {
    return {
      tone: 'success',
      message: t('sidebar.importDoneRelabeledOnly', {
        annotations: result.annotations_imported,
        annSuffix: result.annotations_imported === 1 ? '' : 's',
        relabeled: result.existing_images_relabeled,
        relabeledSuffix: result.existing_images_relabeled === 1 ? '' : 's',
      }),
    }
  }

  // Case B: nothing new at all (all skipped, none relabeled).
  if (result.imported === 0) {
    if (result.skipped === 0) return null
    return { tone: 'warning', message: t('sidebar.importDoneNoneNew', { skipped: result.skipped }) }
  }

  // Case C: new images were added (with or without auto-loaded labels).
  // `images_with_annotations` already includes both new-with-labels and
  // existing-relabeled, so subtract the existing-relabeled count to get the
  // count of newly-imported images that got labels.
  const newImagesWithLabels = Math.max(0, result.images_with_annotations - result.existing_images_relabeled)
  const base = result.annotations_imported > 0
    ? t('sidebar.importDoneWithLabels', {
        imported: result.imported,
        suffix: result.imported === 1 ? '' : 's',
        annotations: result.annotations_imported,
        annSuffix: result.annotations_imported === 1 ? '' : 's',
        labeled: newImagesWithLabels,
        labeledSuffix: newImagesWithLabels === 1 ? '' : 's',
      })
    : t('sidebar.importDone', { imported: result.imported, suffix: result.imported === 1 ? '' : 's' })

  const relabelSuffix = result.existing_images_relabeled > 0
    ? t('sidebar.importDoneRelabeledAlso', {
        relabeled: result.existing_images_relabeled,
        relabeledSuffix: result.existing_images_relabeled === 1 ? '' : 's',
      })
    : ''

  const dupSuffix = result.skipped > result.existing_images_relabeled
    ? t('sidebar.importDoneSkipped', {
        skipped: result.skipped - result.existing_images_relabeled,
        suffix: result.skipped - result.existing_images_relabeled === 1 ? '' : 's',
      })
    : ''

  return { tone: 'success', message: base + relabelSuffix + dupSuffix }
}

export default function ImageBrowser({ images, activeImageId, onSelectImage, onImportComplete }: Props) {
  const updateImageInList = useImageStore((s) => s.updateImageInList)
  const setImporting = useUIStore((s) => s.setImporting)
  const isImporting = useUIStore((s) => s.isImporting)
  const { t, statusLabel, splitLabel, language } = useI18n()
  const dropRef = useRef<HTMLDivElement>(null)
  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null)
  const [viewStatus, setViewStatus] = useState<ViewStatus>('all')
  const [viewSplit, setViewSplit] = useState<ViewSplit>('all')
  // Inline import-result banner. Auto-dismisses 7s after the result lands so
  // users can briefly verify what was added (incl. auto-loaded labels) without
  // a modal interrupting their flow.
  const [importNotice, setImportNotice] = useState<{ tone: 'success' | 'warning' | 'error'; message: string } | null>(null)
  useEffect(() => {
    if (!importNotice) return
    const timer = setTimeout(() => setImportNotice(null), 7000)
    return () => clearTimeout(timer)
  }, [importNotice])
  // Drag-over visual feedback. The native HTML5 dragenter/leave events fire on
  // every child node, so we keep a counter to know when the drag truly leaves
  // the sidebar (counter back to 0).
  const [isDragOver, setIsDragOver] = useState(false)
  const dragCounter = useRef(0)
  // Remove-image confirmation modal state. Holds the image being removed so
  // the dialog can show its filename and annotation count.
  const [pendingRemoval, setPendingRemoval] = useState<Image | null>(null)

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
    try {
      const filePaths = await imageApi.showOpenDialog()
      if (!filePaths) return
      setImporting(true)
      const result = await imageApi.import(filePaths)
      const updated = await imageApi.list()
      await onImportComplete(updated)
      setImportNotice(describeImportResult(result, t))
    } catch (error) {
      console.error(error)
      setImportNotice({ tone: 'error', message: t('sidebar.importDoneFailed', { message: (error as Error).message }) })
    } finally {
      setImporting(false)
    }
  }, [setImporting, onImportComplete, t])

  const handleImportFolder = useCallback(async () => {
    try {
      const folderPath = await imageApi.showFolderDialog()
      if (!folderPath) return
      setImporting(true)
      const result = await imageApi.importFolder(folderPath)
      const updated = await imageApi.list()
      await onImportComplete(updated)
      setImportNotice(describeImportResult(result, t))
    } catch (error) {
      console.error(error)
      setImportNotice({ tone: 'error', message: t('sidebar.importDoneFailed', { message: (error as Error).message }) })
    } finally {
      setImporting(false)
    }
  }, [setImporting, onImportComplete, t])

  // Drag-and-drop: accepts (a) loose image files, (b) a whole folder dragged
  // from the OS file manager, or (c) a mix.  For each dropped entry we look at
  // `webkitGetAsEntry()` — if it's a directory we forward to importFolder so
  // the YOLO/COCO/VOC label sidecars get auto-loaded; if it's a file we batch
  // it for importImages.  Counter-based drag-over tracking gives smooth visual
  // feedback even as the cursor crosses child elements.
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    dragCounter.current += 1
    if (e.dataTransfer.types.includes('Files')) setIsDragOver(true)
  }, [])
  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    dragCounter.current = Math.max(0, dragCounter.current - 1)
    if (dragCounter.current === 0) setIsDragOver(false)
  }, [])
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
  }, [])

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    dragCounter.current = 0
    setIsDragOver(false)
    try {
      // Separate directories from loose files BEFORE iterating `dataTransfer.files`,
      // because webkitGetAsEntry() must be called synchronously on the items.
      const items = Array.from(e.dataTransfer.items ?? [])
      const fileEntries = Array.from(e.dataTransfer.files ?? []) as Array<File & { path: string }>
      const folderPaths: string[] = []
      const loosePaths: string[] = []

      // The `path` property on the File object is an Electron extension giving
      // the absolute path on disk — exactly what the main process needs.
      items.forEach((item, idx) => {
        const entry = (item as { webkitGetAsEntry?: () => { isDirectory?: boolean } | null }).webkitGetAsEntry?.()
        const file = fileEntries[idx]
        if (!file?.path) return
        if (entry?.isDirectory) folderPaths.push(file.path)
        else if (/\.(jpg|jpeg|png|bmp|webp|tiff|tif)$/i.test(file.name)) loosePaths.push(file.path)
      })

      // Fallback: some browsers/Electron versions don't populate items
      if (folderPaths.length === 0 && loosePaths.length === 0) {
        for (const f of fileEntries) {
          if (f.path && /\.(jpg|jpeg|png|bmp|webp|tiff|tif)$/i.test(f.name)) loosePaths.push(f.path)
        }
      }

      if (folderPaths.length === 0 && loosePaths.length === 0) return
      setImporting(true)

      // Aggregate results across multiple drops (e.g. one folder + a few loose files)
      const aggregate: ImportResult = {
        imported: 0, skipped: 0, annotations_imported: 0,
        images_with_annotations: 0, existing_images_relabeled: 0, errors: [],
      }
      const merge = (r: ImportResult): void => {
        aggregate.imported += r.imported
        aggregate.skipped += r.skipped
        aggregate.annotations_imported += r.annotations_imported
        aggregate.images_with_annotations += r.images_with_annotations
        aggregate.existing_images_relabeled += r.existing_images_relabeled
        aggregate.errors.push(...r.errors)
      }

      for (const folder of folderPaths) merge(await imageApi.importFolder(folder))
      if (loosePaths.length > 0) merge(await imageApi.import(loosePaths))

      const updated = await imageApi.list()
      await onImportComplete(updated)
      setImportNotice(describeImportResult(aggregate, t))
    } catch (error) {
      console.error(error)
      setImportNotice({ tone: 'error', message: t('sidebar.importDoneFailed', { message: (error as Error).message }) })
    } finally {
      setImporting(false)
    }
  }, [setImporting, onImportComplete, t])

  // Remove image from project (with confirmation).  Source file on disk is
  // never touched — only the DB record + its annotations + the thumbnail.
  const requestRemoveImage = useCallback((imageId: string) => {
    const img = images.find((i) => i.id === imageId)
    if (img) setPendingRemoval(img)
  }, [images])

  const confirmRemoveImage = useCallback(async () => {
    if (!pendingRemoval) return
    const target = pendingRemoval
    setPendingRemoval(null)
    try {
      await imageApi.delete([target.id])
      const updated = await imageApi.list()
      await onImportComplete(updated)
      setImportNotice({
        tone: 'success',
        message: t('sidebar.removeDoneOne', { filename: target.filename }),
      })
    } catch (error) {
      console.error(error)
      setImportNotice({
        tone: 'error',
        message: t('sidebar.removeDoneFailed', { message: (error as Error).message }),
      })
    }
  }, [pendingRemoval, onImportComplete, t])

  const filteredImages = images.filter((image) => {
    const matchesStatus = viewStatus === 'all' || image.status === viewStatus || (viewStatus === 'labeled' && image.status === 'in_progress')
    const matchesSplit = viewSplit === 'all' || image.split === viewSplit
    return matchesStatus && matchesSplit
  })

  useEffect(() => {
    if (filteredImages.length === 0) return
    if (!filteredImages.some((image) => image.id === activeImageId)) {
      onSelectImage(filteredImages[0].id)
    }
  }, [filteredImages, activeImageId, onSelectImage])

  const itemData: ItemData = { images: filteredImages, activeImageId, onSelectImage, onContextMenu: handleContextMenu }

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
        background: isCurrent ? 'rgba(var(--accent-rgb),0.18)' : 'transparent',
        border: 'none', cursor: 'pointer', textAlign: 'left',
        color: isCurrent ? 'var(--text-primary)' : 'var(--text-secondary)',
        fontWeight: isCurrent ? 700 : 500,
        fontSize: 12,
      }}
    >
      <div style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
      {label}
      {isCurrent && <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--accent)' }}>✓</span>}
    </button>
  )

  const imageCountText = t('sidebar.imagesCount', {
    count: filteredImages.length,
    suffix: filteredImages.length === 1 ? '' : 's',
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
        position: 'relative',
      }}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* Drop-zone overlay — appears while user drags files/folders over the
          sidebar. Pointer-events: none so it doesn't interfere with the drop. */}
      {isDragOver && (
        <div style={{
          position: 'absolute', inset: 4, zIndex: 5000,
          border: '2px dashed var(--accent)',
          borderRadius: 10,
          background: 'rgba(var(--accent-rgb), 0.12)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          pointerEvents: 'none',
          padding: 16,
          textAlign: 'center',
        }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)', lineHeight: 1.4 }}>
            {t('sidebar.dropOverlay')}
          </div>
        </div>
      )}
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
        {importNotice && (
          <div
            role="status"
            onClick={() => setImportNotice(null)}
            style={{
              padding: '8px 10px',
              borderRadius: 6,
              fontSize: 11,
              lineHeight: 1.4,
              cursor: 'pointer',
              background: importNotice.tone === 'error'
                ? 'rgba(239, 68, 68, 0.12)'
                : importNotice.tone === 'warning'
                  ? 'rgba(245, 158, 11, 0.12)'
                  : 'rgba(34, 197, 94, 0.14)',
              color: importNotice.tone === 'error'
                ? '#fca5a5'
                : importNotice.tone === 'warning'
                  ? '#fbbf24'
                  : '#86efac',
              border: `1px solid ${
                importNotice.tone === 'error'
                  ? 'rgba(239, 68, 68, 0.35)'
                  : importNotice.tone === 'warning'
                    ? 'rgba(245, 158, 11, 0.35)'
                    : 'rgba(34, 197, 94, 0.35)'
              }`,
            }}
          >
            {importNotice.message}
          </div>
        )}
        <div style={{
          border: '1px solid var(--border)',
          borderRadius: 6,
          padding: '8px',
          background: 'var(--bg-primary)',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.06em' }}>
            {t('sidebar.viewTitle')}
          </div>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.06em' }}>
              {t('sidebar.status')}
            </span>
            <div style={selectWrapStyle}>
              <select
                value={viewStatus}
                onChange={(e) => setViewStatus(e.target.value as ViewStatus)}
                style={selectFieldStyle}
              >
                <option value="all" style={{ background: '#ffffff', color: '#111111' }}>
                  {language === 'ko' ? '전체 상태' : 'All statuses'}
                </option>
                {STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value} style={{ background: '#ffffff', color: '#111111' }}>
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
                value={viewSplit}
                onChange={(e) => setViewSplit(e.target.value as ViewSplit)}
                style={selectFieldStyle}
              >
                <option value="all" style={{ background: '#ffffff', color: '#111111' }}>
                  {language === 'ko' ? '전체 분할' : 'All splits'}
                </option>
                {SPLIT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value} style={{ background: '#ffffff', color: '#111111' }}>
                    {splitLabel(option.value)}
                  </option>
                ))}
              </select>
              <span style={selectArrowStyle}>▾</span>
            </div>
          </label>
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          {`${imageCountText} / ${images.length}`}
          {isImporting && ` · ${t('sidebar.importing')}`}
        </div>
      </div>

      {/* Image list */}
      {filteredImages.length > 0 ? (
        <List
          height={window.innerHeight - 100}
          itemCount={filteredImages.length}
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
            {images.length === 0 ? t('sidebar.dropHint') : t('sidebar.noImagesInView')}
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
            menuItem(statusLabel(s.value), s.color, () => handleSetStatus(s.value), (ctxImage.status === 'in_progress' ? 'labeled' : ctxImage.status) === s.value)
          )}
          <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
          <div style={{ padding: '4px 10px 6px', fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.06em' }}>
            {t('sidebar.contextSplit')}
          </div>
          {SPLIT_OPTIONS.map((s) =>
            menuItem(splitLabel(s.value), s.color, () => handleSetSplit(s.value), ctxImage.split === s.value)
          )}
          <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
          <button
            onClick={() => { requestRemoveImage(contextMenu.imageId); setContextMenu(null) }}
            style={{
              display: 'flex', alignItems: 'center', gap: 7,
              width: '100%', padding: '7px 10px',
              background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left',
              color: '#ef4444', fontWeight: 600, fontSize: 12,
            }}
          >
            <span style={{ fontSize: 14, lineHeight: 1 }}>🗑</span>
            {t('sidebar.contextRemove')}
          </button>
        </div>
      )}

      {/* Remove-image confirmation modal */}
      {pendingRemoval && (
        <div
          onClick={() => setPendingRemoval(null)}
          style={{
            position: 'fixed', inset: 0, zIndex: 10000,
            background: 'rgba(0,0,0,0.55)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border)',
              borderRadius: 12,
              padding: '20px 22px',
              maxWidth: 420,
              boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
            }}
          >
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12 }}>
              {t('sidebar.removeConfirmTitle')}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6, whiteSpace: 'pre-wrap', marginBottom: 18 }}>
              {pendingRemoval.annotation_count > 0
                ? t('sidebar.removeConfirmBody', {
                    filename: pendingRemoval.filename,
                    annotations: pendingRemoval.annotation_count,
                    annSuffix: pendingRemoval.annotation_count === 1 ? '' : 's',
                  })
                : t('sidebar.removeConfirmBodyNoAnn', { filename: pendingRemoval.filename })}
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setPendingRemoval(null)}
                style={{
                  padding: '8px 16px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                  background: 'var(--bg-tertiary)', color: 'var(--text-primary)',
                  border: '1px solid var(--border)', cursor: 'pointer',
                }}
              >
                {t('sidebar.removeConfirmCancel')}
              </button>
              <button
                onClick={confirmRemoveImage}
                autoFocus
                style={{
                  padding: '8px 16px', borderRadius: 6, fontSize: 12, fontWeight: 700,
                  background: '#dc2626', color: 'white', border: 'none', cursor: 'pointer',
                }}
              >
                {t('sidebar.removeConfirmAction')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
