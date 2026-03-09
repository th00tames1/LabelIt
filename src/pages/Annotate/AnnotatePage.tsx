import { useEffect, useCallback, useState } from 'react'
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
import RightPanel from '../../components/layout/RightPanel/RightPanel'
import ExportDialog from '../../components/ExportDialog'
import AutoSplitDialog from '../../components/AutoSplitDialog'
import AutoLabelDialog from '../../components/AutoLabelDialog'
import { useI18n } from '../../i18n'
import type { ToolType, RightPanelTab } from '../../types'

interface Props {
  onGoHome: () => void
}

interface WorkflowNotice {
  tone: 'info' | 'warning'
  title: string
  message: string
  targetTab?: RightPanelTab
}

export default function AnnotatePage({ onGoHome }: Props) {
  const { images, setImages, activeImageId, setActiveImageId, updateImageInList } = useImageStore()
  const { labels, load: loadLabels } = useLabelStore()
  const { annotations, loadForImage, clear, selectedId, deleteAnnotation, duplicateAnnotation, undo, redo } =
    useAnnotationStore()
  const {
    activeTool, setActiveTool, setActiveLabelClassId,
    activeLabelClassId,
    toggleAnnotationsVisible, showShortcutsHelp, setShowShortcutsHelp, setRightPanelTab,
  } = useUIStore()
  const { t } = useI18n()
  const [showExport, setShowExport] = useState(false)
  const [showAutoSplit, setShowAutoSplit] = useState(false)
  const [showAutoLabel, setShowAutoLabel] = useState(false)
  // Quick-label popup: shown after drawing a new annotation
  const [quickPickAnnotationId, setQuickPickAnnotationId] = useState<string | null>(null)
  const [workflowNotice, setWorkflowNotice] = useState<WorkflowNotice | null>(null)

  // Load images and labels on mount — auto-select first unlabeled image
  useEffect(() => {
    const load = async () => {
      const [imgs] = await Promise.all([
        imageApi.list(),
        loadLabels(),
      ])
      setImages(imgs)
      if (imgs.length > 0) {
        // Prefer first unlabeled image, fall back to first image
        const firstUnlabeled = imgs.find((img) => img.status === 'unlabeled')
        const startImg = firstUnlabeled ?? imgs[0]
        setActiveImageId(startImg.id)
        await loadForImage(startImg.id)
      }
    }
    load().catch(console.error)

    return () => { clear() }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Keep the label/tool state safe for first-time workflows.
  useEffect(() => {
    if (labels.length === 0) {
      setActiveLabelClassId(null)
      setRightPanelTab('labels')
      if (activeTool !== 'select') setActiveTool('select')
      return
    }

    const activeStillExists = activeLabelClassId != null && labels.some((label) => label.id === activeLabelClassId)
    if (!activeStillExists) {
      setActiveLabelClassId(labels[0].id)
    }
  }, [labels, activeLabelClassId, activeTool, setActiveLabelClassId, setActiveTool, setRightPanelTab])

  // Load annotations when active image changes
  const handleSelectImage = useCallback(async (imageId: string) => {
    setWorkflowNotice(null)
    setActiveImageId(imageId)
    await loadForImage(imageId)
  }, [setActiveImageId, loadForImage])

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

        // H: toggle annotation visibility
        if (e.key === 'h' || e.key === 'H') {
          toggleAnnotationsVisible()
          return
        }

        // ?: show keyboard shortcuts help
        if (e.key === '?') {
          setShowShortcutsHelp(true)
          return
        }

        const toolMap: Record<string, ToolType> = {
          v: 'select', w: 'bbox', e: 'polygon', k: 'keypoint', s: 'sam',
        }
        const requestedTool = toolMap[e.key.toLowerCase()]
        if (requestedTool) {
          if (requestedTool !== 'select' && labels.length === 0) {
            e.preventDefault()
            showCreateLabelNotice()
            return
          }
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
      activeLabelClassId, toggleAnnotationsVisible, setShowShortcutsHelp,
      updateImageInList, canMarkCurrentImageComplete, showCreateLabelNotice,
  ])

  const activeImage = images.find((img) => img.id === activeImageId) ?? null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      <TopBar
        onGoHome={onGoHome}
        onExport={() => setShowExport(true)}
        onAutoSplit={() => setShowAutoSplit(true)}
        onAutoLabel={() => setShowAutoLabel(true)}
      />
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Left sidebar: image browser */}
        <ImageBrowser
          images={images}
          activeImageId={activeImageId}
          onSelectImage={handleSelectImage}
          onImportComplete={(newImages) => setImages(newImages)}
        />

        {/* Main canvas area */}
        <div style={{ flex: 1, position: 'relative', overflow: 'hidden', background: '#0a0a0a' }}>
          {labels.length === 0 && (
            <div style={{
              position: 'absolute', top: 16, left: 16, right: 16, zIndex: 5,
              display: 'flex', justifyContent: 'center', pointerEvents: 'none',
            }}>
              <div style={{
                pointerEvents: 'auto',
                width: 'min(560px, 100%)',
                background: 'rgba(24,24,30,0.92)',
                border: '1px solid rgba(99,102,241,0.35)',
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
                <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                  <button
                    onClick={() => setRightPanelTab('labels')}
                    style={{
                      padding: '7px 12px', borderRadius: 6, border: 'none', cursor: 'pointer',
                      background: 'var(--accent)', color: 'white', fontSize: 12, fontWeight: 600,
                    }}
                  >
                    {t('annotate.openLabels')}
                  </button>
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
                {workflowNotice.targetTab && (
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

          {activeImage ? (
            <AnnotationCanvas
              image={activeImage}
              activeTool={activeTool}
              onAnnotationCreated={(id) => { if (!activeLabelClassId) setQuickPickAnnotationId(id) }}
            />
          ) : (
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              height: '100%', color: '#6b6b6b', fontSize: 14,
            }}>
              {t('annotate.noImages')}
            </div>
          )}
        </div>

        {/* Right panel: annotations + labels */}
        <RightPanel />
      </div>

      {showExport && <ExportDialog onClose={() => setShowExport(false)} />}
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
