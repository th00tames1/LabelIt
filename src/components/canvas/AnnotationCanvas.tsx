import { useRef, useState, useCallback, useEffect } from 'react'
import { Stage, Layer, Image as KonvaImage, Line, Circle } from 'react-konva'
import useImage from 'use-image'
import type Konva from 'konva'
import type { Image, ToolType, NormalizedPoint, AnnotationGeometry } from '../../types'
import { useAnnotationStore } from '../../store/annotationStore'
import { useLabelStore } from '../../store/labelStore'
import { useUIStore } from '../../store/uiStore'
import { sidecarClient } from '../../api/sidecar'
import BoundingBoxShape from './annotations/BoundingBoxShape'
import PolygonShape from './annotations/PolygonShape'
import KeypointShape from './annotations/KeypointShape'
import MaskOverlay from './annotations/MaskOverlay'
import BBoxPreview from './tools/BBoxPreview'
import PolygonPreview from './tools/PolygonPreview'
import { toLocalFileUrl } from '../../utils/paths'
import { useI18n } from '../../i18n'

interface Props {
  image: Image
  activeTool: ToolType
  onAnnotationCreated?: (annotationId: string) => void
}

const MIN_SCALE = 0.05
const MAX_SCALE = 40

interface SAMPoint { x: number; y: number; label: 0 | 1 }

interface SamRunMeta {
  processingTimeMs: number
  mode: 'point' | 'text'
  deviceLabel: string
  acceleration: 'gpu' | 'cpu'
}

export default function AnnotationCanvas({ image, activeTool, onAnnotationCreated }: Props) {
  const stageRef = useRef<Konva.Stage>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const [stageSize, setStageSize] = useState({ width: 800, height: 600 })
  // scale: zoom level. imgX/imgY: top-left of image in stage pixels
  const [scale, setScale] = useState(1)
  const [imgX, setImgX] = useState(0)
  const [imgY, setImgY] = useState(0)

  // 'anonymous' crossOrigin: required so Konva canvas stays untainted when
  // we call toDataURL() for SAM prediction. Works because localfile:// serves
  // Access-Control-Allow-Origin: * headers (corsEnabled:true in main/index.ts).
  const [loadedImg] = useImage(toLocalFileUrl(image.file_path), 'anonymous')

  // Tool state
  const [bboxStart, setBboxStart] = useState<NormalizedPoint | null>(null)
  const [bboxCurrent, setBboxCurrent] = useState<NormalizedPoint | null>(null)
  const [polygonPoints, setPolygonPoints] = useState<NormalizedPoint[]>([])
  const [mousePos, setMousePos] = useState<NormalizedPoint | null>(null)
  const isPanning = useRef(false)
  const lastPointer = useRef({ x: 0, y: 0 })

  // SAM tool state
  const [samPoints, setSamPoints] = useState<SAMPoint[]>([])
  const [samContours, setSamContours] = useState<[number, number][][] | null>(null)
  const [samLoading, setSamLoading] = useState(false)
  const [samText, setSamText] = useState<string>('')
  const [samLastRun, setSamLastRun] = useState<SamRunMeta | null>(null)
  const [samError, setSamError] = useState<string | null>(null)

  const { annotations, selectedId, setSelectedId, createAnnotation, updateGeometry } =
    useAnnotationStore()
  const { labels } = useLabelStore()
  const { activeLabelClassId, annotationsVisible, sidecarRuntime } = useUIStore()
  const { language, t } = useI18n()

  // Wrapper: create annotation and notify parent for label quick-pick
  const createAndNotify = useCallback(async (
    imgId: string,
    type: Parameters<typeof createAnnotation>[1],
    geom: Parameters<typeof createAnnotation>[2],
    labelId: Parameters<typeof createAnnotation>[3],
  ) => {
    const ann = await createAnnotation(imgId, type, geom, labelId)
    onAnnotationCreated?.(ann.id)
    return ann
  }, [createAnnotation, onAnnotationCreated])

  // Fit image to canvas on load or image change
  useEffect(() => {
    if (!containerRef.current) return
    const { clientWidth: w, clientHeight: h } = containerRef.current
    setStageSize({ width: w, height: h })
    fitImage(w, h)
  }, [image.id, image.width, image.height]) // eslint-disable-line react-hooks/exhaustive-deps

  // Resize observer
  useEffect(() => {
    if (!containerRef.current) return
    const observer = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect
      setStageSize({ width, height })
    })
    observer.observe(containerRef.current)
    return () => observer.disconnect()
  }, [])

  const fitImage = (containerW: number, containerH: number) => {
    const margin = 40
    const scaleX = (containerW - margin * 2) / image.width
    const scaleY = (containerH - margin * 2) / image.height
    const newScale = Math.min(scaleX, scaleY, 1)
    const dispW = image.width * newScale
    const dispH = image.height * newScale
    setScale(newScale)
    setImgX((containerW - dispW) / 2)
    setImgY((containerH - dispH) / 2)
  }

  // Displayed image dimensions in stage pixels (single scale application — no double scaling)
  const dispW = image.width * scale
  const dispH = image.height * scale

  const applyScaleAt = useCallback((nextScale: number, anchorX: number, anchorY: number) => {
    const clamped = Math.max(MIN_SCALE, Math.min(MAX_SCALE, nextScale))
    const ratio = clamped / scale
    setScale(clamped)
    setImgX(anchorX - (anchorX - imgX) * ratio)
    setImgY(anchorY - (anchorY - imgY) * ratio)
  }, [scale, imgX, imgY])

  const scaleToSlider = useCallback((value: number) => {
    const minLog = Math.log(MIN_SCALE)
    const maxLog = Math.log(MAX_SCALE)
    const ratio = (Math.log(value) - minLog) / (maxLog - minLog)
    return Math.round(ratio * 1000)
  }, [])

  const sliderToScale = useCallback((value: number) => {
    const minLog = Math.log(MIN_SCALE)
    const maxLog = Math.log(MAX_SCALE)
    const ratio = value / 1000
    return Math.exp(minLog + (maxLog - minLog) * ratio)
  }, [])

  const zoomPercent = Math.round(scale * 100)

  /** Convert stage pixel position to normalized image coordinates (0–1) */
  const toNormalized = useCallback((stageX: number, stageY: number): NormalizedPoint => {
    const nx = (stageX - imgX) / (image.width * scale)
    const ny = (stageY - imgY) / (image.height * scale)
    return { x: Math.max(0, Math.min(1, nx)), y: Math.max(0, Math.min(1, ny)) }
  }, [imgX, imgY, image.width, image.height, scale])

  const getPointerNorm = useCallback((): NormalizedPoint | null => {
    const stage = stageRef.current
    if (!stage) return null
    const pos = stage.getPointerPosition()
    if (!pos) return null
    return toNormalized(pos.x, pos.y)
  }, [toNormalized])

  const getActiveLabelId = useCallback((): string | null => {
    return activeLabelClassId ?? labels[0]?.id ?? null
  }, [activeLabelClassId, labels])

  // Convert loaded image to base64 for SAM inference
  const getImageBase64 = useCallback((): string | null => {
    if (!loadedImg) return null
    const canvas = document.createElement('canvas')
    canvas.width = image.width
    canvas.height = image.height
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(loadedImg, 0, 0)
    return canvas.toDataURL('image/jpeg', 0.85).split(',')[1]
  }, [loadedImg, image.width, image.height])

  // Run SAM prediction with current points (point-prompt mode)
  const runSAMPrediction = useCallback(async (points: SAMPoint[]) => {
    if (points.length === 0) { setSamContours(null); setSamError(null); return }
    const base64 = getImageBase64()
    if (!base64) return
    setSamLoading(true)
    setSamError(null)
    try {
      const result = await sidecarClient.samPredict({
        image_base64: base64,
        points: points.map((p) => [p.x, p.y]),
        point_labels: points.map((p) => p.label),
        text: null,
        multimask: false,
      })
      setSamContours(result.contours)
      setSamLastRun({
        processingTimeMs: result.processing_time_ms,
        mode: result.mode,
        deviceLabel: result.runtime.device_label,
        acceleration: result.runtime.acceleration,
      })
    } catch (err) {
      console.warn('SAM prediction failed:', err)
      setSamContours(null)
      setSamLastRun(null)
      setSamError(err instanceof Error ? err.message : String(err))
    } finally {
      setSamLoading(false)
    }
  }, [getImageBase64])

  // Run SAM prediction with text/concept prompt (SAM 3 text mode)
  const runSAMTextPrediction = useCallback(async (text: string) => {
    if (!text.trim()) return
    const base64 = getImageBase64()
    if (!base64) return
    setSamLoading(true)
    setSamError(null)
    try {
      const result = await sidecarClient.samPredict({
        image_base64: base64,
        points: [],
        point_labels: [],
        text: text.trim(),
        multimask: false,
      })
      setSamContours(result.contours)
      setSamLastRun({
        processingTimeMs: result.processing_time_ms,
        mode: result.mode,
        deviceLabel: result.runtime.device_label,
        acceleration: result.runtime.acceleration,
      })
    } catch (err) {
      console.warn('SAM text prediction failed:', err)
      setSamContours(null)
      setSamLastRun(null)
      setSamError(err instanceof Error ? err.message : String(err))
    } finally {
      setSamLoading(false)
    }
  }, [getImageBase64])

  // Commit SAM mask(s) as polygon annotation(s)
  const commitSAM = useCallback(async () => {
    if (!samContours || samContours.length === 0) return
    const labelId = getActiveLabelId()

    if (samText.trim() && samContours.length > 1) {
      // Text mode: commit ALL contours as separate polygon annotations
      for (const contour of samContours) {
        if (contour.length < 3) continue
        const geometry: AnnotationGeometry = {
          type: 'polygon',
          points: contour.map(([x, y]) => [x, y]),
        }
        await createAndNotify(image.id, 'polygon', geometry, labelId)
      }
    } else {
      // Point mode (or single contour from text): use the largest contour
      const largest = samContours.reduce((a, b) => (a.length >= b.length ? a : b))
      const geometry: AnnotationGeometry = {
        type: 'polygon',
        points: largest.map(([x, y]) => [x, y]),
      }
      await createAndNotify(image.id, 'polygon', geometry, labelId)
    }

    setSamPoints([])
    setSamContours(null)
    setSamText('')
    setSamError(null)
  }, [samContours, samText, createAndNotify, image.id, getActiveLabelId])

  // ─── Wheel zoom ─────────────────────────────────────────────────────────────
  const handleWheel = useCallback((e: Konva.KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault()
    const stage = stageRef.current!
    const pointer = stage.getPointerPosition()!
    const factor = e.evt.deltaY < 0 ? 1.12 : 1 / 1.12
    const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, scale * factor))
    applyScaleAt(newScale, pointer.x, pointer.y)
  }, [scale, applyScaleAt])

  // ─── Middle-mouse pan ────────────────────────────────────────────────────────
  const handleStageMouseDown = useCallback((e: Konva.KonvaEventObject<MouseEvent>) => {
    if (e.evt.button === 1 || (e.evt.button === 0 && e.evt.altKey)) {
      isPanning.current = true
      lastPointer.current = { x: e.evt.clientX, y: e.evt.clientY }
      return
    }

    const norm = getPointerNorm()
    if (!norm) return

    if (activeTool === 'bbox') {
      setBboxStart(norm)
      setBboxCurrent(norm)
    } else if (activeTool === 'select') {
      // Clicking on empty space deselects
      if ((e.target as unknown as Konva.Node) === e.target.getStage()) {
        setSelectedId(null)
      }
    }
  }, [activeTool, getPointerNorm, setSelectedId])

  const handleStageMouseMove = useCallback((e: Konva.KonvaEventObject<MouseEvent>) => {
    if (isPanning.current) {
      const dx = e.evt.clientX - lastPointer.current.x
      const dy = e.evt.clientY - lastPointer.current.y
      lastPointer.current = { x: e.evt.clientX, y: e.evt.clientY }
      setImgX((x) => x + dx)
      setImgY((y) => y + dy)
      return
    }

    const norm = getPointerNorm()
    if (!norm) return
    setMousePos(norm)

    if (activeTool === 'bbox' && bboxStart) {
      setBboxCurrent(norm)
    }
  }, [activeTool, bboxStart, getPointerNorm])

  const handleStageMouseUp = useCallback(async (_e: Konva.KonvaEventObject<MouseEvent>) => {
    if (isPanning.current) { isPanning.current = false; return }

    if (activeTool === 'bbox' && bboxStart && bboxCurrent) {
      const x = Math.min(bboxStart.x, bboxCurrent.x)
      const y = Math.min(bboxStart.y, bboxCurrent.y)
      const w = Math.abs(bboxCurrent.x - bboxStart.x)
      const h = Math.abs(bboxCurrent.y - bboxStart.y)
      if (w > 0.005 && h > 0.005) {
        const geometry: AnnotationGeometry = { type: 'bbox', x, y, width: w, height: h }
        await createAndNotify(image.id, 'bbox', geometry, getActiveLabelId())
      }
      setBboxStart(null)
      setBboxCurrent(null)
    }
  }, [activeTool, bboxStart, bboxCurrent, createAndNotify, image.id, getActiveLabelId])

  // ─── Click: polygon vertex placement + keypoint placement ────────────────────
  const handleStageClick = useCallback(async (e: Konva.KonvaEventObject<MouseEvent>) => {
    const norm = getPointerNorm()
    if (!norm) return

    if (activeTool === 'polygon') {
      if (polygonPoints.length >= 3) {
        const first = polygonPoints[0]
        const dx = norm.x - first.x
        const dy = norm.y - first.y
        if (Math.sqrt(dx * dx + dy * dy) < 0.015) {
          const geometry: AnnotationGeometry = {
            type: 'polygon',
            points: polygonPoints.map(({ x, y }) => [x, y]),
          }
          await createAndNotify(image.id, 'polygon', geometry, getActiveLabelId())
          setPolygonPoints([])
          return
        }
      }
      setPolygonPoints((pts) => [...pts, norm])
    } else if (activeTool === 'keypoint') {
      // Only place on background canvas (not on an existing annotation shape)
      const isBackground = (e.target as unknown as Konva.Node) === e.target.getStage()
      if (isBackground) {
        const geometry: AnnotationGeometry = {
          type: 'keypoints',
          keypoints: [{ kp_def_id: '', x: norm.x, y: norm.y, visibility: 2 }],
        }
        await createAndNotify(image.id, 'keypoints', geometry, getActiveLabelId())
      }
    } else if (activeTool === 'sam') {
      // Left click = positive point
      const newPoints = [...samPoints, { x: norm.x, y: norm.y, label: 1 as const }]
      setSamPoints(newPoints)
      runSAMPrediction(newPoints).catch(console.error)
    }
  }, [activeTool, polygonPoints, samPoints, getPointerNorm, createAndNotify, image.id, getActiveLabelId, runSAMPrediction])

  // SAM right-click = negative point
  const handleStageContextMenu = useCallback((e: Konva.KonvaEventObject<MouseEvent>) => {
    if (activeTool !== 'sam') return
    e.evt.preventDefault()
    const norm = getPointerNorm()
    if (!norm) return
    const newPoints = [...samPoints, { x: norm.x, y: norm.y, label: 0 as const }]
    setSamPoints(newPoints)
    runSAMPrediction(newPoints).catch(console.error)
  }, [activeTool, samPoints, getPointerNorm, runSAMPrediction])

  const handleStageDblClick = useCallback(async () => {
    if (activeTool !== 'polygon' || polygonPoints.length < 3) return
    const geometry: AnnotationGeometry = {
      type: 'polygon',
      points: polygonPoints.map(({ x, y }) => [x, y]),
    }
    await createAndNotify(image.id, 'polygon', geometry, getActiveLabelId())
    setPolygonPoints([])
  }, [activeTool, polygonPoints, createAndNotify, image.id, getActiveLabelId])

  // Escape cancels in-progress drawing; Enter commits SAM
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Don't capture Enter/Escape when typing in the SAM text input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.key === 'Escape') {
        setBboxStart(null); setBboxCurrent(null); setPolygonPoints([])
        setSamPoints([]); setSamContours(null); setSamText(''); setSamLastRun(null); setSamError(null)
      }
      if (e.key === 'Enter' && activeTool === 'sam') {
        commitSAM().catch(console.error)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [activeTool, commitSAM])

  // Reset SAM state when switching away from SAM tool
  useEffect(() => {
    if (activeTool !== 'sam') {
      setSamPoints([])
      setSamContours(null)
      setSamText('')
      setSamLastRun(null)
      setSamError(null)
    }
  }, [activeTool])

  useEffect(() => {
    setSamPoints([])
    setSamContours(null)
    setSamText('')
    setSamLastRun(null)
    setSamError(null)
  }, [image.id])

  // F / 0 = fit to view
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.key === 'f' || e.key === '0') {
        fitImage(stageSize.width, stageSize.height)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [stageSize]) // eslint-disable-line react-hooks/exhaustive-deps

  const getLabelColor = (labelClassId: string | null): string => {
    if (!labelClassId) return '#888'
    return labels.find((l) => l.id === labelClassId)?.color ?? '#888'
  }

  const getLabelName = (labelClassId: string | null): string => {
    if (!labelClassId) return t('annotationList.unlabeled')
    return labels.find((l) => l.id === labelClassId)?.name ?? t('annotationList.unlabeled')
  }

  const activeSamLabel = labels.find((label) => label.id === getActiveLabelId()) ?? null
  const samPreviewColor = activeSamLabel?.color ?? 'var(--accent)'
  const samPreviewFill = activeSamLabel?.color != null ? `${activeSamLabel.color}33` : 'rgba(var(--accent-rgb),0.18)'
  const samPreviewLabel = activeSamLabel?.name ?? t('annotationList.unlabeled')

  const formatSamMs = (value: number) => {
    if (value >= 1000) return `${(value / 1000).toFixed(1)}s`
    return `${Math.round(value)}ms`
  }

  const getContourBounds = (contour: [number, number][]) => {
    if (contour.length === 0) {
      return { minX: 0.5, minY: 0.5, maxX: 0.5, maxY: 0.5 }
    }

    const initial = contour[0]
    return contour.reduce((acc, [x, y]) => ({
      minX: Math.min(acc.minX, x),
      minY: Math.min(acc.minY, y),
      maxX: Math.max(acc.maxX, x),
      maxY: Math.max(acc.maxY, y),
    }), {
      minX: initial[0],
      minY: initial[1],
      maxX: initial[0],
      maxY: initial[1],
    })
  }

  const samPreviewTags = (() => {
    const tagWidth = Math.max(72, samPreviewLabel.length * 7 + 16)
    const clampTag = (left: number, top: number) => ({
      left: Math.max(imgX + 4, Math.min(imgX + dispW - tagWidth - 4, left)),
      top: Math.max(imgY + 4, Math.min(imgY + dispH - 24, top)),
      width: tagWidth,
    })

    if (samContours != null && samContours.length > 0) {
      return samContours.map((contour, index) => {
        const bounds = getContourBounds(contour)
        return {
          key: `contour-${index}`,
          ...clampTag(imgX + bounds.minX * dispW + 8, imgY + bounds.minY * dispH + 8),
        }
      })
    }

    if (samPoints.length > 0) {
      const anchor = samPoints[samPoints.length - 1]
      return [{
        key: 'point-preview',
        ...clampTag(imgX + anchor.x * dispW + 10, imgY + anchor.y * dispH - 28),
      }]
    }

    return []
  })()
  const samRuntimeText = sidecarRuntime == null
    ? t('sam.runtimeChecking')
    : sidecarRuntime.acceleration === 'gpu'
      ? t('sam.runtimeGpu')
      : t('sam.runtimeCpu')

  const cursor =
    activeTool === 'bbox' || activeTool === 'polygon'
    || activeTool === 'keypoint' || activeTool === 'sam'
      ? 'crosshair'
      : 'default'

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%', cursor, position: 'relative' }}>
      <Stage
        ref={stageRef}
        width={stageSize.width}
        height={stageSize.height}
        onWheel={handleWheel}
        onMouseDown={handleStageMouseDown}
        onMouseMove={handleStageMouseMove}
        onMouseUp={handleStageMouseUp}
        onClick={handleStageClick}
        onDblClick={handleStageDblClick}
        onContextMenu={handleStageContextMenu}
      >
        {/* Layer 1: Image */}
        <Layer>
          {loadedImg && (
            <KonvaImage
              image={loadedImg}
              x={imgX}
              y={imgY}
              width={dispW}
              height={dispH}
              listening={false}
            />
          )}
        </Layer>

        {/* Layer 2: Annotations — hidden when annotationsVisible is false (H key) */}
        <Layer visible={annotationsVisible} listening={annotationsVisible}>
          {annotations.map((ann) => {
            const color = getLabelColor(ann.label_class_id)
            const labelName = getLabelName(ann.label_class_id)
            const isSelected = ann.id === selectedId
            const shapeProps = {
              annotation: ann,
              color,
              labelName,
              isSelected,
              imgX, imgY, imgW: dispW, imgH: dispH,
              onSelect: () => setSelectedId(ann.id),
              onUpdateGeometry: (geo: AnnotationGeometry) => updateGeometry(ann.id, geo),
            }

            if (ann.annotation_type === 'bbox') {
              return <BoundingBoxShape key={ann.id} {...shapeProps} />
            }
            if (ann.annotation_type === 'polygon' || ann.annotation_type === 'polyline') {
              return <PolygonShape key={ann.id} {...shapeProps} />
            }
            if (ann.annotation_type === 'keypoints') {
              return <KeypointShape key={ann.id} {...shapeProps} />
            }
            if (ann.annotation_type === 'mask') {
              return <MaskOverlay key={ann.id} {...shapeProps} />
            }
            return null
          })}
        </Layer>

        {/* Layer 3: Tool preview */}
        <Layer listening={false}>
          {activeTool === 'bbox' && bboxStart && bboxCurrent && (
            <BBoxPreview
              start={bboxStart} current={bboxCurrent}
              imgX={imgX} imgY={imgY} imgW={dispW} imgH={dispH}
            />
          )}
          {activeTool === 'polygon' && polygonPoints.length > 0 && mousePos && (
            <PolygonPreview
              points={polygonPoints} mousePos={mousePos}
              imgX={imgX} imgY={imgY} imgW={dispW} imgH={dispH}
            />
          )}
          {/* SAM preview: mask contours + point prompts */}
          {activeTool === 'sam' && (
            <>
              {samContours && samContours.map((contour, ci) => (
                <Line
                  key={ci}
                  points={contour.flatMap(([nx, ny]) => [imgX + nx * dispW, imgY + ny * dispH])}
                  closed
                  stroke={samPreviewColor}
                  strokeWidth={2}
                  fill={samPreviewFill}
                  perfectDrawEnabled={false}
                />
              ))}
              {samPoints.map((pt, i) => (
                <Circle
                  key={i}
                  x={imgX + pt.x * dispW}
                  y={imgY + pt.y * dispH}
                  radius={6}
                  fill={pt.label === 1 ? '#22c55e' : '#ef4444'}
                  stroke="white"
                  strokeWidth={2}
                  perfectDrawEnabled={false}
                />
              ))}
              {samLoading && (
                <Line
                  points={[imgX, imgY, imgX + dispW, imgY]}
                  stroke={samPreviewColor}
                  strokeWidth={3}
                  dash={[10, 5]}
                  perfectDrawEnabled={false}
                />
              )}
            </>
          )}
        </Layer>
      </Stage>

      {activeTool === 'sam' && samPreviewTags.length > 0 && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            zIndex: 4,
          }}
        >
          {samPreviewTags.map((tag) => (
            <div
              key={tag.key}
              style={{
                position: 'absolute',
                left: tag.left,
                top: tag.top,
                minWidth: tag.width,
                maxWidth: 180,
                padding: '4px 10px',
                borderRadius: 6,
                background: samPreviewColor,
                color: 'white',
                fontSize: 11,
                fontWeight: 700,
                lineHeight: 1.2,
                boxShadow: '0 8px 20px rgba(0,0,0,0.28)',
                border: '1px solid rgba(255,255,255,0.18)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {samPreviewLabel}
            </div>
          ))}
        </div>
      )}

      <div
        style={{
          position: 'absolute',
          left: 16,
          bottom: 16,
          zIndex: 5,
          minWidth: 230,
          padding: '10px 12px',
          borderRadius: 12,
          background: 'rgba(18, 18, 18, 0.92)',
          border: '1px solid rgba(255,255,255,0.12)',
          boxShadow: '0 10px 28px rgba(0,0,0,0.32)',
          backdropFilter: 'blur(10px)',
          pointerEvents: 'auto',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            {t('canvas.zoom')}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', minWidth: 50, textAlign: 'right' }}>
              {zoomPercent}%
            </span>
            <button
              onClick={() => fitImage(stageSize.width, stageSize.height)}
              style={{
                minWidth: 46,
                height: 26,
                padding: '0 10px',
                borderRadius: 6,
                background: 'var(--bg-tertiary)',
                border: '1px solid var(--border)',
                color: 'var(--text-secondary)',
                fontSize: 11,
                fontWeight: 600,
              }}
            >
              {t('canvas.fit')}
            </button>
          </div>
        </div>
        <input
          type="range"
          min={0}
          max={1000}
          step={1}
          value={scaleToSlider(scale)}
          onChange={(e) => applyScaleAt(
            sliderToScale(Number(e.target.value)),
            stageSize.width / 2,
            stageSize.height / 2,
          )}
          style={{ width: '100%', marginTop: 8, accentColor: 'var(--accent)' }}
        />
      </div>

      {/* SAM 3 control panel — floats above the canvas when SAM tool is active */}
      {activeTool === 'sam' && (
        <div
          style={{
            position: 'absolute',
            bottom: 16,
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgba(15,15,15,0.92)',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 10,
            padding: '10px 14px',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            minWidth: 360,
            maxWidth: 520,
            backdropFilter: 'blur(8px)',
            boxShadow: '0 4px 24px rgba(0,0,0,0.5)',
            zIndex: 10,
            pointerEvents: 'auto',
          }}
        >
          {/* Text prompt row */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              type="text"
              value={samText}
              onChange={(e) => setSamText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && samText.trim()) {
                  e.stopPropagation()
                  runSAMTextPrediction(samText).catch(console.error)
                }
              }}
              placeholder={language === 'ko'
                ? '텍스트 프롬프트: "차", "사람", "개"...'
                : 'Text prompt: "car", "person", "dog"...'}
              style={{
                flex: 1,
                background: 'rgba(255,255,255,0.07)',
                border: '1px solid rgba(255,255,255,0.18)',
                borderRadius: 6,
                color: '#fff',
                padding: '5px 10px',
                fontSize: 13,
                outline: 'none',
              }}
            />
            <button
              onClick={() => runSAMTextPrediction(samText).catch(console.error)}
              disabled={!samText.trim() || samLoading}
              style={{
                background: samText.trim() && !samLoading ? 'var(--accent)' : 'rgba(var(--accent-rgb),0.35)',
                color: '#fff',
                border: 'none',
                borderRadius: 6,
                padding: '5px 12px',
                fontSize: 13,
                cursor: samText.trim() && !samLoading ? 'pointer' : 'not-allowed',
                whiteSpace: 'nowrap',
                fontWeight: 500,
              }}
            >
              {samLoading ? (language === 'ko' ? '⏳ 실행 중...' : '⏳ Running...') : (language === 'ko' ? '🔍 모두 감지' : '🔍 Detect All')}
            </button>
          </div>

          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 10,
            flexWrap: 'wrap',
          }}>
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '4px 10px',
              borderRadius: 999,
              background: sidecarRuntime?.acceleration === 'gpu'
                ? 'rgba(34,197,94,0.16)'
                : 'rgba(245,158,11,0.16)',
              border: sidecarRuntime?.acceleration === 'gpu'
                ? '1px solid rgba(34,197,94,0.26)'
                : '1px solid rgba(245,158,11,0.26)',
            }}>
              <span style={{
                width: 7,
                height: 7,
                borderRadius: '50%',
                background: sidecarRuntime?.acceleration === 'gpu' ? '#22c55e' : '#f59e0b',
              }} />
              <span style={{
                fontSize: 11,
                fontWeight: 700,
                color: sidecarRuntime?.acceleration === 'gpu' ? '#bbf7d0' : '#fde68a',
              }}>
                {samRuntimeText}
              </span>
            </div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.58)' }}>
              {`${t('sam.devicePrefix')}: ${sidecarRuntime?.device_label ?? '-'}`}
            </div>
          </div>

          {sidecarRuntime?.nvidia_gpu_detected && !sidecarRuntime.cuda_available && (
            <div style={{ fontSize: 11, color: '#fde68a', lineHeight: 1.45 }}>
              {t('sam.gpuDetectedButUnused')}
            </div>
          )}

          {/* Status + commit row */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)' }}>
              {samLoading
                ? (language === 'ko' ? 'SAM 3 실행 중 (CPU에서는 60-180초 걸릴 수 있음)...' : 'SAM 3 running (may take 60-180s on CPU)...')
                : samContours
                ? (language === 'ko'
                  ? `${samContours.length}개 마스크 준비됨 - Enter 또는 Commit 클릭`
                  : `${samContours.length} mask(s) ready - press Enter or click Commit`)
                : (language === 'ko'
                  ? t('sam.clickHint')
                  : t('sam.clickHint'))}
            </span>
            {samContours && samContours.length > 0 && (
              <button
                onClick={() => commitSAM().catch(console.error)}
                style={{
                  background: '#22c55e',
                  color: '#000',
                  border: 'none',
                  borderRadius: 6,
                  padding: '4px 12px',
                  fontSize: 12,
                  cursor: 'pointer',
                  fontWeight: 600,
                  marginLeft: 8,
                }}
              >
                  {language === 'ko' ? `✓ 확정 (${samContours.length})` : `✓ Commit (${samContours.length})`}
                </button>
              )}
            </div>

          {(samPoints.length > 0 || samLastRun != null) && (
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 10,
              flexWrap: 'wrap',
            }}>
              {samPoints.length > 0 && (
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.42)' }}>
                  {t('sam.pointPreviewReady')}
                </div>
              )}
              {samLastRun && (
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.52)' }}>
                  {`${t('sam.lastRunPrefix')}: ${formatSamMs(samLastRun.processingTimeMs)} · ${samLastRun.deviceLabel}`}
                </div>
              )}
            </div>
          )}

          {samError && (
            <div style={{
              padding: '8px 10px',
              borderRadius: 8,
              background: 'rgba(239,68,68,0.12)',
              border: '1px solid rgba(239,68,68,0.28)',
              color: '#fecaca',
              fontSize: 11,
              lineHeight: 1.45,
              wordBreak: 'break-word',
            }}>
              {samError}
            </div>
          )}

          {/* SAM point summary */}
          {samPoints.length > 0 && (
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>
              {language === 'ko'
                ? `${samPoints.filter((p) => p.label === 1).length}개 긍정 · ${samPoints.filter((p) => p.label === 0).length}개 부정 포인트`
                : `${samPoints.filter((p) => p.label === 1).length} positive · ${samPoints.filter((p) => p.label === 0).length} negative point(s) placed`}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
