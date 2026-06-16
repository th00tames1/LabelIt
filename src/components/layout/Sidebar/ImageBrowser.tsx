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
type ViewStatus = ImageStatus | 'all' | 'excluded'
type ViewSplit = SplitType | 'all'

interface Props {
  images: Image[]
  activeImageId: string | null
  onSelectImage: (id: string) => void
  onImportComplete: (images: Image[]) => Promise<void> | void
  // Bumped by the parent (filename overlay click) to scroll the active image to
  // the centre of the list on demand — we intentionally do NOT auto-scroll on
  // every selection, which the user found disorienting.
  scrollToActiveSignal?: number
}

interface ContextMenu {
  imageId: string
  x: number
  y: number
}

interface ItemData {
  images: Image[]
  activeImageId: string | null
  selectedIds: Set<string>
  onItemClick: (id: string, e: React.MouseEvent) => void
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
  const isSelected = data.selectedIds.has(image.id)
  const { language, statusLabel, t } = useI18n()

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

  // Active item shows the accent border; multi-selected (but not active) items
  // show a softer accent ring. Excluded items are dimmed.
  const borderColor = isActive ? 'var(--accent)' : isSelected ? 'rgba(var(--accent-rgb),0.55)' : 'transparent'

  return (
    <div
      style={{ ...style, padding: '4px 6px', cursor: 'pointer' }}
      onClick={(e) => data.onItemClick(image.id, e)}
      onContextMenu={handleContextMenu}
    >
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 8px',
        borderRadius: 6,
        background: isActive ? 'var(--bg-hover)' : isSelected ? 'rgba(var(--accent-rgb),0.10)' : 'transparent',
        border: `1px solid ${borderColor}`,
        height: ITEM_HEIGHT - 8,
        opacity: image.is_excluded ? 0.5 : 1,
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
            {image.is_excluded ? (
              <>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#ef4444' }} />
                <span style={{ fontSize: 10, color: '#ef4444', fontWeight: 700 }}>{t('sidebar.statusExcluded')}</span>
              </>
            ) : (
              <>
                <div style={{
                  width: 6, height: 6, borderRadius: '50%',
                  background: statusColor[displayStatus] ?? '#555',
                }} />
                <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{statusLabel(displayStatus as ImageStatus)}</span>
              </>
            )}
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

  if (result.imported === 0) {
    if (result.skipped === 0) return null
    return { tone: 'warning', message: t('sidebar.importDoneNoneNew', { skipped: result.skipped }) }
  }

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

export default function ImageBrowser({ images, activeImageId, onSelectImage, onImportComplete, scrollToActiveSignal = 0 }: Props) {
  const updateImageInList = useImageStore((s) => s.updateImageInList)
  const setImporting = useUIStore((s) => s.setImporting)
  const isImporting = useUIStore((s) => s.isImporting)
  const { t, statusLabel, splitLabel, language } = useI18n()
  const dropRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<List>(null)
  const listWrapRef = useRef<HTMLDivElement>(null)
  const [listHeight, setListHeight] = useState(0)
  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null)
  const [viewStatus, setViewStatus] = useState<ViewStatus>('all')
  const [viewSplit, setViewSplit] = useState<ViewSplit>('all')
  const [importNotice, setImportNotice] = useState<{ tone: 'success' | 'warning' | 'error'; message: string } | null>(null)
  // Multi-selection (Ctrl/Shift) for batch operations. `anchorId` is the pivot
  // for shift-range selection.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const anchorIdRef = useRef<string | null>(null)
  // Drag-over visual feedback.
  const [isDragOver, setIsDragOver] = useState(false)
  const dragCounter = useRef(0)

  useEffect(() => {
    if (!importNotice) return
    const timer = setTimeout(() => setImportNotice(null), 7000)
    return () => clearTimeout(timer)
  }, [importNotice])

  // Measure the list viewport so react-window virtualizes against the real
  // height from the very first render — fixes the "list not fully loaded until
  // I scroll/resize" issue on large datasets (req #6).
  useEffect(() => {
    const el = listWrapRef.current
    if (!el) return
    const measure = () => setListHeight(el.clientHeight)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

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

  const filteredImages = images.filter((image) => {
    let matchesStatus: boolean
    if (viewStatus === 'all') {
      matchesStatus = true
    } else if (viewStatus === 'excluded') {
      matchesStatus = image.is_excluded
    } else {
      // Keep the image currently being worked on visible in the "unlabeled" view
      // even after its first label lands, so multi-object images don't vanish
      // mid-edit (req #5).
      matchesStatus = image.status === viewStatus
        || (viewStatus === 'labeled' && image.status === 'in_progress')
        || (viewStatus === 'unlabeled' && image.id === activeImageId)
    }
    const matchesSplit = viewSplit === 'all' || image.split === viewSplit
    return matchesStatus && matchesSplit
  })

  // Scroll the active image to the centre ONLY when explicitly requested (the
  // user clicks the filename overlay). Auto-scrolling on every click was
  // disorienting, so it was removed (req #2).
  useEffect(() => {
    if (scrollToActiveSignal === 0 || !activeImageId) return
    const idx = filteredImages.findIndex((image) => image.id === activeImageId)
    if (idx >= 0) listRef.current?.scrollToItem(idx, 'center')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrollToActiveSignal])

  // Click handler with Ctrl (toggle) / Shift (range) multi-selection (req #18).
  const handleItemClick = useCallback((id: string, e: React.MouseEvent) => {
    if (e.shiftKey && anchorIdRef.current) {
      const anchorIdx = filteredImages.findIndex((img) => img.id === anchorIdRef.current)
      const targetIdx = filteredImages.findIndex((img) => img.id === id)
      if (anchorIdx >= 0 && targetIdx >= 0) {
        const [lo, hi] = anchorIdx < targetIdx ? [anchorIdx, targetIdx] : [targetIdx, anchorIdx]
        const range = filteredImages.slice(lo, hi + 1).map((img) => img.id)
        setSelectedIds(new Set(range))
        return
      }
    }
    if (e.ctrlKey || e.metaKey) {
      setSelectedIds((prev) => {
        const next = new Set(prev)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        return next
      })
      anchorIdRef.current = id
      return
    }
    // Plain click: clear multi-selection and open the image for editing.
    setSelectedIds(new Set())
    anchorIdRef.current = id
    onSelectImage(id)
  }, [filteredImages, onSelectImage])

  const handleUpdateStatus = useCallback(async (imageId: string, status: ImageStatus) => {
    await imageApi.updateStatus(imageId, status)
    await syncImage(imageId)
  }, [syncImage])

  // Apply a status to the right-clicked image, or to the whole multi-selection
  // if the right-clicked image is part of it.
  const targetIdsFor = useCallback((imageId: string): string[] => {
    return selectedIds.size > 1 && selectedIds.has(imageId) ? Array.from(selectedIds) : [imageId]
  }, [selectedIds])

  const handleSetStatus = async (status: ImageStatus) => {
    if (!contextMenu) return
    const ids = targetIdsFor(contextMenu.imageId)
    if (ids.length > 1) {
      await imageApi.setStatusBatch(ids, status)
    } else {
      await imageApi.updateStatus(ids[0], status)
    }
    const updated = await imageApi.list()
    await onImportComplete(updated)
    setContextMenu(null)
  }

  const handleSetSplit = async (split: SplitType) => {
    if (!contextMenu) return
    const ids = targetIdsFor(contextMenu.imageId)
    if (ids.length > 1) {
      await imageApi.setSplitBatch(ids, split)
    } else {
      await imageApi.updateSplit(ids[0], split)
    }
    const updated = await imageApi.list()
    await onImportComplete(updated)
    setContextMenu(null)
  }

  // Exclude / include images from the dataset (reversible, non-destructive).
  const applyExcluded = useCallback(async (ids: string[], excluded: boolean) => {
    if (ids.length === 0) return
    try {
      await imageApi.setExcluded(ids, excluded)
      const updated = await imageApi.list()
      await onImportComplete(updated)
      setImportNotice({
        tone: 'success',
        message: excluded
          ? t('sidebar.excludeDone', { count: ids.length, suffix: ids.length === 1 ? '' : 's' })
          : t('sidebar.includeDone', { count: ids.length, suffix: ids.length === 1 ? '' : 's' }),
      })
    } catch (error) {
      console.error(error)
      setImportNotice({ tone: 'error', message: t('sidebar.excludeFailed', { message: (error as Error).message }) })
    }
  }, [onImportComplete, t])

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

  // Drag-and-drop: accepts loose image files, a whole folder, or a mix.
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
      const items = Array.from(e.dataTransfer.items ?? [])
      const fileEntries = Array.from(e.dataTransfer.files ?? []) as Array<File & { path: string }>
      const folderPaths: string[] = []
      const loosePaths: string[] = []

      items.forEach((item, idx) => {
        const entry = (item as { webkitGetAsEntry?: () => { isDirectory?: boolean } | null }).webkitGetAsEntry?.()
        const file = fileEntries[idx]
        if (!file?.path) return
        if (entry?.isDirectory) folderPaths.push(file.path)
        else if (/\.(jpg|jpeg|png|bmp|webp|tiff|tif)$/i.test(file.name)) loosePaths.push(file.path)
      })

      if (folderPaths.length === 0 && loosePaths.length === 0) {
        for (const f of fileEntries) {
          if (f.path && /\.(jpg|jpeg|png|bmp|webp|tiff|tif)$/i.test(f.name)) loosePaths.push(f.path)
        }
      }

      if (folderPaths.length === 0 && loosePaths.length === 0) return
      setImporting(true)

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

  // Drop selections that fall outside the current filtered view.
  useEffect(() => {
    if (selectedIds.size === 0) return
    const visible = new Set(filteredImages.map((img) => img.id))
    let changed = false
    const next = new Set<string>()
    selectedIds.forEach((id) => { if (visible.has(id)) next.add(id); else changed = true })
    if (changed) setSelectedIds(next)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredImages.length, viewStatus, viewSplit])

  useEffect(() => {
    if (filteredImages.length === 0) return
    if (!filteredImages.some((image) => image.id === activeImageId)) {
      onSelectImage(filteredImages[0].id)
    }
  }, [filteredImages, activeImageId, onSelectImage])

  const itemData: ItemData = { images: filteredImages, activeImageId, selectedIds, onItemClick: handleItemClick, onContextMenu: handleContextMenu }

  // Context menu: find current image to show current values
  const ctxImage = contextMenu ? images.find((i) => i.id === contextMenu.imageId) : null
  const ctxIsBatch = contextMenu ? (selectedIds.size > 1 && selectedIds.has(contextMenu.imageId)) : false

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
                <option value="excluded" style={{ background: '#ffffff', color: '#111111' }}>
                  {t('sidebar.statusExcluded')}
                </option>
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

      {/* Batch action bar — shown when 2+ images are multi-selected (req #18) */}
      {selectedIds.size > 1 && (
        <div style={{
          padding: '6px 10px',
          borderBottom: '1px solid var(--border)',
          background: 'rgba(var(--accent-rgb),0.10)',
          display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
        }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)' }}>
            {t('sidebar.selectedCount', { count: selectedIds.size })}
          </span>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
            <button
              onClick={() => applyExcluded(Array.from(selectedIds), true)}
              style={{
                fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 6,
                border: '1px solid rgba(239,68,68,0.5)', background: 'transparent', color: '#ef4444', cursor: 'pointer',
              }}
            >
              {t('sidebar.batchExclude')}
            </button>
            <button
              onClick={() => applyExcluded(Array.from(selectedIds), false)}
              style={{
                fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 6,
                border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer',
              }}
            >
              {t('sidebar.batchInclude')}
            </button>
            <button
              onClick={() => setSelectedIds(new Set())}
              style={{
                fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 6,
                border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer',
              }}
            >
              {t('sidebar.batchClear')}
            </button>
          </div>
        </div>
      )}

      {/* Image list */}
      <div ref={listWrapRef} style={{ flex: 1, minHeight: 0 }}>
        {filteredImages.length > 0 && listHeight > 0 ? (
          <List
            ref={listRef}
            height={listHeight}
            itemCount={filteredImages.length}
            itemSize={ITEM_HEIGHT}
            width={SIDEBAR_WIDTH}
            itemData={itemData}
          >
            {ImageItem}
          </List>
        ) : (
          <div style={{
            height: '100%', display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            padding: 16, textAlign: 'center',
          }}>
            <div style={{ color: 'var(--text-muted)', fontSize: 12, lineHeight: 1.5 }}>
              {images.length === 0 ? t('sidebar.dropHint') : t('sidebar.noImagesInView')}
            </div>
          </div>
        )}
      </div>

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
          {ctxIsBatch && (
            <div style={{ padding: '4px 10px 6px', fontSize: 10, fontWeight: 700, color: 'var(--accent)', letterSpacing: '0.04em' }}>
              {t('sidebar.selectedCount', { count: selectedIds.size })}
            </div>
          )}
          <div style={{ padding: '4px 10px 6px', fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.06em' }}>
            {t('sidebar.contextStatus')}
          </div>
          {STATUS_OPTIONS.map((s) =>
            menuItem(statusLabel(s.value), s.color, () => handleSetStatus(s.value), !ctxIsBatch && (ctxImage.status === 'in_progress' ? 'labeled' : ctxImage.status) === s.value)
          )}
          <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
          <div style={{ padding: '4px 10px 6px', fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.06em' }}>
            {t('sidebar.contextSplit')}
          </div>
          {SPLIT_OPTIONS.map((s) =>
            menuItem(splitLabel(s.value), s.color, () => handleSetSplit(s.value), !ctxIsBatch && ctxImage.split === s.value)
          )}
          <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
          {/* Exclude / Include (req #14). Operates on the multi-selection when the
              right-clicked image is part of it, otherwise on the single image. */}
          {(ctxIsBatch ? false : ctxImage.is_excluded) ? (
            <button
              onClick={() => { applyExcluded(targetIdsFor(contextMenu.imageId), false); setContextMenu(null) }}
              style={{
                display: 'flex', alignItems: 'center', gap: 7, width: '100%', padding: '7px 10px',
                background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left',
                color: 'var(--text-secondary)', fontWeight: 600, fontSize: 12,
              }}
            >
              <span style={{ fontSize: 14, lineHeight: 1 }}>↩</span>
              {t('sidebar.contextInclude')}
            </button>
          ) : (
            <button
              onClick={() => { applyExcluded(targetIdsFor(contextMenu.imageId), true); setContextMenu(null) }}
              style={{
                display: 'flex', alignItems: 'center', gap: 7, width: '100%', padding: '7px 10px',
                background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left',
                color: '#ef4444', fontWeight: 600, fontSize: 12,
              }}
            >
              <span style={{ fontSize: 14, lineHeight: 1 }}>🚫</span>
              {t('sidebar.contextExclude')}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
