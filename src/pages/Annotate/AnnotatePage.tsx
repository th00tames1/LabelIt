import { useEffect, useCallback, useRef, useState } from 'react'
import { useImageStore } from '../../store/imageStore'
import { useLabelStore } from '../../store/labelStore'
import { useAnnotationStore } from '../../store/annotationStore'
import { useUIStore } from '../../store/uiStore'
import { imageApi } from '../../api/ipc'
import LabelQuickPick from '../../components/LabelQuickPick'
import ShortcutsHelp from '../../components/ShortcutsHelp'
import TopBar from '../../components/layout/TopBar/TopBar'
import ImageBrowser from '../../components/layout/Sidebar/ImageBrowser'
import AnnotationCanvas from '../../components/canvas/AnnotationCanvas'
import type { AnnotationCanvasHandle } from '../../components/canvas/AnnotationCanvas'
import RightPanel from '../../components/layout/RightPanel/RightPanel'
import CanvasErrorBoundary from '../../components/CanvasErrorBoundary'
import ToolRail from '../../components/layout/ToolRail'
import AutoSplitDialog from '../../components/AutoSplitDialog'
import AutoLabelDialog from '../../components/AutoLabelDialog'
import { useI18n } from '../../i18n'
import type { ToolType, RightPanelTab } from '../../types'

interface Props {
  onGoHome: () => void
  onFinish: () => void
  menuImportSignal?: number
  onSetupAi?: () => void
}

interface WorkflowNotice {
  tone: 'info' | 'warning'
  title: string
  message: string
  targetTab?: RightPanelTab
}

export default function AnnotatePage({ onGoHome, onFinish, menuImportSignal = 0, onSetupAi }: Props) {
  const { images, setImages, activeImageId, setActiveImageId, updateImageInList } = useImageStore()
  const { labels, load: loadLabels, toggleLabelVisible } = useLabelStore()
  const { annotations, loadForImage, clear, selectedId, deleteAnnotation, duplicateAnnotation, undo, redo } =
    useAnnotationStore()
  const {
    activeTool, setActiveTool, setActiveLabelClassId,
    activeLabelClassId,
    showShortcutsHelp, setShowShortcutsHelp, setRightPanelTab,
  } = useUIStore()
  const { t } = useI18n()
  const [showAutoSplit, setShowAutoSplit] = useState(false)
  const [showAutoLabel, setShowAutoLabel] = useState(false)
  // Quick-label popup: shown after drawing a new annotation
  const [quickPickAnnotationId, setQuickPickAnnotationId] = useState<string | null>(null)
  const [workflowNotice, setWorkflowNotice] = useState<WorkflowNotice | null>(null)
  // Bumped to ask the image list to scroll the active image into the centre —
  // triggered by clicking the filename overlay (not on every selection).
  const [scrollToActiveSignal, setScrollToActiveSignal] = useState(0)
  const activeImageIdRef = useRef<string | null>(activeImageId)
  const canvasRef = useRef<AnnotationCanvasHandle>(null)

  useEffect(() => {
    activeImageIdRef.current = activeImageId
  }, [activeImageId])

  const syncImportedData = useCallback(async (nextImages: typeof images, targetImageId?: string | null) => {
    await loadLabels()
    setImages(nextImages)

    const target = targetImageId != null
      ? nextImages.find((img) => img.id === targetImageId) ?? null
      : null

    if (target) {
      setActiveImageId(target.id)
      await loadForImage(target.id)
      return
    }

    if (activeImageIdRef.current == null && nextImages.length > 0) {
      setActiveImageId(nextImages[0].id)
      await loadForImage(nextImages[0].id)
      return
    }

    // The active image may have just been relabeled by the import (e.g. user
    // dropped YOLO label files into an already-imported folder).  Reload its
    // annotations so they show up on the canvas without a manual reselect.
    if (activeImageIdRef.current != null) {
      await loadForImage(activeImageIdRef.current)
    }
  }, [loadForImage, loadLabels, setActiveImageId, setImages])

  // Load images and labels on mount — auto-select first unlabeled image
  useEffect(() => {
    const load = async () => {
      const [imgs] = await Promise.all([
        imageApi.list(),
        loadLabels(),
      ])
      setImages(imgs)
      if (imgs.length > 0) {
        const preservedImage = activeImageId != null
          ? imgs.find((img) => img.id === activeImageId) ?? null
          : null
        const firstUnlabeled = imgs.find((img) => img.status === 'unlabeled')
        const startImg = preservedImage ?? firstUnlabeled ?? imgs[0]
        setActiveImageId(startImg.id)
        await loadForImage(startImg.id)
      }
    }
    load().catch((err) => {
      // Surface load failures — a silent catch left the user staring at an
      // empty canvas with no idea why nothing showed up.
      console.error('[AnnotatePage] initial load failed:', err)
      setWorkflowNotice({
        tone: 'warning',
        title: t('notice.loadFailedTitle'),
        message: (err instanceof Error ? err.message : String(err)),
        targetTab: 'annotations',
      })
    })

    return () => { clear() }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Keep the label/tool state safe for first-time workflows.
  useEffect(() => {
    if (labels.length === 0) {
      setActiveLabelClassId(null)
      setRightPanelTab('labels')
      if (activeTool !== 'select' && activeTool !== 'null') setActiveTool('select')
      return
    }

    const activeStillExists = activeLabelClassId != null && labels.some((label) => label.id === activeLabelClassId)
    if (!activeStillExists) {
      setActiveLabelClassId(labels[0].id)
    }
  }, [labels, activeLabelClassId, activeTool, setActiveLabelClassId, setActiveTool, setRightPanelTab])

  // The active drawing tool PERSISTS across image navigation — we no longer force
  // it to 'select'/'No-Objects' when landing on an empty or no-objects image,
  // because that broke the flow of drawing boxes across many images (you'd have
  // to re-pick the tool after every empty image). Drawing on a no-objects image
  // simply clears its flag here.
  useEffect(() => {
    const img = images.find((image) => image.id === activeImageId) ?? null
    if (!img?.is_null || annotations.length === 0) return
    // A label was drawn on a "no objects" image → it has objects after all.
    imageApi.updateNull(img.id, false)
      .then(async () => {
        const updated = await imageApi.get(img.id)
        if (updated) updateImageInList(updated)
      })
      .catch(console.error)
  }, [annotations.length, activeImageId, images, updateImageInList])

  // Load annotations when active image changes
  const handleSelectImage = useCallback(async (imageId: string) => {
    setWorkflowNotice(null)
    setActiveImageId(imageId)
    await loadForImage(imageId)
  }, [setActiveImageId, loadForImage])

  // Exclude the active image from the dataset, then advance to a neighbour so the
  // user keeps moving forward (req #8 / #14). The image stays in the project with
  // its labels — it's just flagged out of split/export/augmentation.
  const handleExcludeActiveImage = useCallback(async () => {
    if (!activeImageId) return
    const idx = images.findIndex((i) => i.id === activeImageId)
    const after = idx >= 0 ? images.slice(idx + 1).find((i) => !i.is_excluded) : undefined
    const before = idx > 0 ? [...images.slice(0, idx)].reverse().find((i) => !i.is_excluded) : undefined
    const neighbor = after ?? before ?? null
    try {
      await imageApi.setExcluded([activeImageId], true)
      const updated = await imageApi.get(activeImageId)
      if (updated) updateImageInList(updated)
      if (neighbor) await handleSelectImage(neighbor.id)
    } catch (err) {
      console.error('[exclude] failed:', err)
    }
  }, [activeImageId, images, updateImageInList, handleSelectImage])

  // Toggle the "reviewed" (approved) state for the active image (req #15).
  const handleToggleReviewed = useCallback(async () => {
    if (!activeImageId) return
    const img = images.find((i) => i.id === activeImageId)
    if (!img) return
    const nextStatus = img.status === 'approved'
      ? ((annotations.length > 0 || img.is_null) ? 'labeled' : 'unlabeled')
      : 'approved'
    try {
      await imageApi.updateStatus(activeImageId, nextStatus)
      const updated = await imageApi.get(activeImageId)
      if (updated) updateImageInList(updated)
    } catch (err) {
      console.error('[review] failed:', err)
    }
  }, [activeImageId, images, annotations.length, updateImageInList])

  useEffect(() => {
    if (menuImportSignal === 0) return

    const run = async () => {
      const filePaths = await imageApi.showOpenDialog()
      if (!filePaths || filePaths.length === 0) return

      await imageApi.import(filePaths)
      const nextImages = await imageApi.list()
      if (nextImages.length === 0) {
        await syncImportedData(nextImages)
        return
      }

      const preserved = activeImageId != null
        ? nextImages.find((image) => image.id === activeImageId) ?? null
        : null
      const target = preserved ?? nextImages[0]
      await syncImportedData(nextImages, target.id)
    }

    run().catch((err) => {
      // Menu-triggered imports used to silently swallow errors; users would
      // click File→Import and nothing would happen with no feedback.  Now we
      // surface the error in the workflow notice strip so the user knows why.
      console.error('[menuImport] failed:', err)
      setWorkflowNotice({
        tone: 'warning',
        title: t('notice.loadFailedTitle'),
        message: err instanceof Error ? err.message : String(err),
        targetTab: 'annotations',
      })
    })
  }, [menuImportSignal, syncImportedData, t])

  const showCreateLabelNotice = useCallback(() => {
    setActiveTool('select')
    setRightPanelTab('labels')
    setWorkflowNotice({
      tone: 'info',
      title: t('notice.createLabelTitle'),
      message: t('notice.createLabelMessage'),
      targetTab: 'labels',
    })
  }, [setActiveTool, setRightPanelTab, t])

  const canMarkCurrentImageComplete = useCallback(() => {
    if (!activeImageId) return false

    if (annotations.length === 0) {
      setRightPanelTab('annotations')
      setWorkflowNotice({
        tone: 'warning',
        title: t('notice.cannotCompleteTitle'),
        message: t('notice.cannotCompleteMessage'),
        targetTab: 'annotations',
      })
      return false
    }

    if (annotations.some((annotation) => annotation.label_class_id == null)) {
      setRightPanelTab('annotations')
      setWorkflowNotice({
        tone: 'warning',
        title: t('notice.labelEveryAnnotationTitle'),
        message: t('notice.labelEveryAnnotationMessage'),
        targetTab: 'annotations',
      })
      return false
    }

    if (annotations.some((annotation) => annotation.source === 'yolo_auto')) {
      setRightPanelTab('annotations')
      setWorkflowNotice({
        tone: 'warning',
        title: t('notice.reviewAutoLabelsTitle'),
        message: t('notice.reviewAutoLabelsMessage'),
        targetTab: 'annotations',
      })
      return false
    }

    return true
  }, [activeImageId, annotations, setRightPanelTab, t])

  const selectedLabelClassId = selectedId != null
    ? (annotations.find((annotation) => annotation.id === selectedId)?.label_class_id ?? null)
    : null

  // Global keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return

      // ─── Image navigation ──────────────────────────────────────────────────
      const currentIdx = images.findIndex((img) => img.id === activeImageId)

      // Tab / ArrowRight: next image
      if ((e.key === 'Tab' && !e.shiftKey) || e.key === 'ArrowRight') {
        e.preventDefault()
        const next = images[currentIdx + 1]
        if (next) handleSelectImage(next.id)
        return
      }
      // Shift+Tab / ArrowLeft: previous image
      if ((e.key === 'Tab' && e.shiftKey) || e.key === 'ArrowLeft') {
        e.preventDefault()
        const prev = images[currentIdx - 1]
        if (prev) handleSelectImage(prev.id)
        return
      }
      // N: jump to next unlabeled image
      if (e.key === 'n' || e.key === 'N') {
        e.preventDefault()
        const nextUnlabeled = images.find(
          (img, idx) => idx > currentIdx && img.status === 'unlabeled'
        ) ?? images.find((img) => img.status === 'unlabeled')
        if (nextUnlabeled) handleSelectImage(nextUnlabeled.id)
        return
      }

      // ─── Tool shortcuts (no modifier) ──────────────────────────────────────
      if (!e.ctrlKey && !e.metaKey && !e.altKey) {
        // Space: mark current image as "labeled" and jump to next unlabeled
        if (e.key === ' ') {
          e.preventDefault()
          if (labels.length === 0) {
            showCreateLabelNotice()
            return
          }
          if (activeImageId && canMarkCurrentImageComplete()) {
            setWorkflowNotice(null)
            imageApi.updateStatus(activeImageId, 'labeled')
              .then(async () => {
                const updated = await imageApi.get(activeImageId)
                if (updated) updateImageInList(updated)
                // Jump to next unlabeled
                const nextUnlabeled = images.find(
                  (img, idx) => idx > currentIdx && img.status === 'unlabeled'
                ) ?? images.find((img) => img.status === 'unlabeled' && img.id !== activeImageId)
                if (nextUnlabeled) handleSelectImage(nextUnlabeled.id)
              })
              .catch(console.error)
          }
          return
        }

        // H: toggle selected label visibility
        if (e.key === 'h' || e.key === 'H') {
          const targetLabelId = selectedLabelClassId ?? activeLabelClassId
          if (targetLabelId) toggleLabelVisible(targetLabelId)
          return
        }

        // ?: show keyboard shortcuts help
        if (e.key === '?') {
          setShowShortcutsHelp(true)
          return
        }

        const toolMap: Record<string, ToolType> = {
          v: 'select', w: 'bbox', e: 'polygon', l: 'polyline', s: 'sam', k: 'keypoint',
        }
        const requestedTool = toolMap[e.key.toLowerCase()]
        if (requestedTool) {
          if (requestedTool !== 'select' && labels.length === 0) {
            e.preventDefault()
            showCreateLabelNotice()
            return
          }
          e.preventDefault()
          // Tool persists across images; drawing on a no-objects image clears the
          // flag automatically (see the un-null effect). No forced switching here.
          setActiveTool(requestedTool)
          return
        }

        // Delete / Backspace: delete selected annotation
        if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) {
          e.preventDefault()
          deleteAnnotation(selectedId).catch(console.error)
          return
        }

        // 1–9: select label class by index
        const digit = parseInt(e.key)
        if (digit >= 1 && digit <= 9) {
          const label = labels[digit - 1]
          if (label) setActiveLabelClassId(label.id)
          return
        }
      }

      // ─── Ctrl/Cmd shortcuts ────────────────────────────────────────────────
      if (e.ctrlKey || e.metaKey) {
        if (e.key === 'z' && !e.shiftKey) {
          e.preventDefault()
          // If currently drawing polygon/polyline, undo last placed point instead of store undo
          if (canvasRef.current?.isDrawing()) {
            canvasRef.current.undoLastPoint()
            return
          }
          undo().catch(console.error)
          return
        }
        if (e.key === 'y' || (e.key === 'z' && e.shiftKey)) {
          e.preventDefault()
          redo().catch(console.error)
          return
        }
        if (e.key === 'd' && selectedId) {
          e.preventDefault()
          duplicateAnnotation(selectedId).catch(console.error)
          return
        }
      }
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [
      images, activeImageId, handleSelectImage,
      activeTool, setActiveTool,
      selectedId, deleteAnnotation, duplicateAnnotation, undo, redo,
      labels, setActiveLabelClassId,
      activeLabelClassId, selectedLabelClassId, toggleLabelVisible, setShowShortcutsHelp,
      updateImageInList, canMarkCurrentImageComplete, showCreateLabelNotice,
  ])

  const activeImage = images.find((img) => img.id === activeImageId) ?? null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      <TopBar
        onGoHome={onGoHome}
        onFinish={onFinish}
        onAutoSplit={() => setShowAutoSplit(true)}
        onAutoLabel={() => setShowAutoLabel(true)}
        onSetupAi={onSetupAi}
      />
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Left sidebar: image browser */}
        <ImageBrowser
          images={images}
          activeImageId={activeImageId}
          onSelectImage={handleSelectImage}
          scrollToActiveSignal={scrollToActiveSignal}
          onImportComplete={async (newImages) => {
            await syncImportedData(newImages)
          }}
        />

        {/* Main canvas area */}
        <div style={{ flex: 1, position: 'relative', overflow: 'hidden', background: 'var(--canvas-bg)' }}>
          {labels.length === 0 && (
            <div style={{
              position: 'absolute', top: 16, left: 16, right: 16, zIndex: 5,
              display: 'flex', justifyContent: 'center', pointerEvents: 'none',
            }}>
              <div style={{
                pointerEvents: 'auto',
                width: 'min(560px, 100%)',
                background: 'rgba(24,24,30,0.92)',
                border: '1px solid rgba(var(--accent-rgb),0.38)',
                borderRadius: 10,
                padding: '14px 16px',
                boxShadow: '0 12px 32px rgba(0,0,0,0.35)',
              }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#f8fafc', marginBottom: 6 }}>
                  {t('annotate.onboardingTitle')}
                </div>
                <div style={{ fontSize: 12, color: '#cbd5e1', lineHeight: 1.6 }}>
                  {t('annotate.onboardingBody')}
                </div>
              </div>
            </div>
          )}

          {workflowNotice && labels.length > 0 && (
            <div style={{
              position: 'absolute', top: 16, left: 16, right: 16, zIndex: 6,
              display: 'flex', justifyContent: 'center', pointerEvents: 'none',
            }}>
              <div style={{
                pointerEvents: 'auto',
                width: 'min(520px, 100%)',
                background: workflowNotice.tone === 'warning'
                  ? 'rgba(120,53,15,0.92)'
                  : 'rgba(30,41,59,0.92)',
                border: workflowNotice.tone === 'warning'
                  ? '1px solid rgba(251,191,36,0.35)'
                  : '1px solid rgba(148,163,184,0.28)',
                borderRadius: 10,
                padding: '12px 14px',
                boxShadow: '0 12px 32px rgba(0,0,0,0.35)',
              }}>
                <div style={{ display: 'flex', alignItems: 'start', gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#f8fafc', marginBottom: 4 }}>
                      {workflowNotice.title}
                    </div>
                    <div style={{ fontSize: 12, color: '#e2e8f0', lineHeight: 1.5 }}>
                      {workflowNotice.message}
                    </div>
                  </div>
                  <button
                    onClick={() => setWorkflowNotice(null)}
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer',
                      color: '#cbd5e1', fontSize: 16, lineHeight: 1,
                    }}
                    title={t('common.dismiss')}
                  >
                    ×
                  </button>
                </div>
                {workflowNotice.targetTab === 'labels' && (
                  <div style={{ marginTop: 10 }}>
                    <button
                      onClick={() => setRightPanelTab(workflowNotice.targetTab!)}
                      style={{
                        padding: '6px 10px', borderRadius: 6, border: 'none', cursor: 'pointer',
                        background: workflowNotice.tone === 'warning' ? '#f59e0b' : 'var(--accent)',
                        color: workflowNotice.tone === 'warning' ? '#111827' : 'white',
                        fontSize: 12, fontWeight: 700,
                      }}
                    >
                      {workflowNotice.targetTab === 'labels'
                        ? t('annotate.openLabels')
                        : t('annotate.openAnnotations')}
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Top-left overlay: current image name + position in the list (req #13).
              Clicking it scrolls the image list to centre the current image. */}
          {activeImage && (
            <button
              onClick={() => setScrollToActiveSignal((s) => s + 1)}
              title={t('annotate.locateInList')}
              style={{
                position: 'absolute', top: 16, left: 16, zIndex: 5,
                display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'flex-start',
                padding: '6px 10px', borderRadius: 8, cursor: 'pointer', textAlign: 'left',
                background: 'rgba(20,20,26,0.62)',
                border: '1px solid rgba(255,255,255,0.08)',
                backdropFilter: 'blur(6px)',
                maxWidth: 360,
              }}
            >
              <div style={{
                fontSize: 12, fontWeight: 600, color: '#f1f5f9',
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 340,
              }}>
                {activeImage.filename}
              </div>
              <div style={{ fontSize: 11, color: '#94a3b8', fontVariantNumeric: 'tabular-nums' }}>
                {(images.findIndex((i) => i.id === activeImageId) + 1)} / {images.length}
                {activeImage.is_excluded && ` · ${t('topbar.excludeTool')}`}
              </div>
            </button>
          )}

          {activeImage ? (
            <CanvasErrorBoundary>
              <AnnotationCanvas
                ref={canvasRef}
                image={activeImage}
                activeTool={activeTool}
                onAnnotationCreated={(id) => { if (!activeLabelClassId) setQuickPickAnnotationId(id) }}
                onSetupAi={onSetupAi}
              />
            </CanvasErrorBoundary>
          ) : (
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              height: '100%', color: '#6b6b6b', fontSize: 14,
            }}>
              {t('annotate.noImages')}
            </div>
          )}

          {/* Bottom-right review button — square icon button matching the tool
              rail. Green when reviewed (approved), neutral otherwise (req #15/#4).
              Shifts left when the SAM panel occupies the corner. */}
          {activeImage && (() => {
            const reviewed = activeImage.status === 'approved'
            return (
              <button
                onClick={handleToggleReviewed}
                title={t('annotate.reviewedHint')}
                style={{
                  position: 'absolute', bottom: 16, right: activeTool === 'sam' ? 256 : 16, zIndex: 5,
                  width: 44, height: 44,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  borderRadius: 12, cursor: 'pointer',
                  border: `1px solid ${reviewed ? '#22c55e' : 'var(--border)'}`,
                  background: reviewed ? '#22c55e' : 'var(--panel-floating)',
                  color: reviewed ? 'white' : 'var(--text-secondary)',
                  boxShadow: '0 10px 28px rgba(0,0,0,0.18)',
                  backdropFilter: 'blur(10px)',
                }}
              >
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                  <path d="M4 10.5L8 14.5L16 5.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            )
          })()}

          {/* Floating tool rail — overlays the right edge (req #3) */}
          <ToolRail onExcludeActiveImage={handleExcludeActiveImage} />
        </div>

        {/* Right panel: annotations + labels */}
        <RightPanel />
      </div>

      {showAutoLabel && (
        <AutoLabelDialog
          images={images}
          activeImageId={activeImageId}
          onClose={() => setShowAutoLabel(false)}
          onComplete={async (affectedImageIds) => {
            // Reload labels (auto-created classes) + current image annotations
            await loadLabels()
            if (activeImageId && affectedImageIds.includes(activeImageId)) {
              await loadForImage(activeImageId)
            }
          }}
        />
      )}
      {/* Quick label picker: shown after drawing a new annotation when no label is pre-selected */}
      {quickPickAnnotationId && (
        <LabelQuickPick
          annotationId={quickPickAnnotationId}
          onDismiss={() => setQuickPickAnnotationId(null)}
        />
      )}

      {/* Keyboard shortcuts help overlay */}
      {showShortcutsHelp && <ShortcutsHelp />}

      {showAutoSplit && (
        <AutoSplitDialog
          totalImages={images.length}
          onClose={() => setShowAutoSplit(false)}
          onComplete={async () => {
            const updated = await imageApi.list()
            setImages(updated)
          }}
        />
      )}
    </div>
  )
}
