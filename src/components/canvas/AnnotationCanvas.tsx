import { useRef, useState, useCallback, useEffect } from 'react'
import type { CSSProperties } from 'react'
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

const zoomIconButtonStyle: CSSProperties = {
  width: 26,
  height: 26,
  borderRadius: 999,
  border: 'none',
  background: 'transparent',
  color: 'var(--text-primary)',
  fontSize: 20,
  lineHeight: 1,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
}

const zoomResetButtonStyle: CSSProperties = {
  minWidth: 72,
  height: 30,
  padding: '0 14px',
  borderRadius: 999,
  border: '1px solid rgba(201,160,44,0.6)',
  background: 'transparent',
  color: '#c59a19',
  fontSize: 12,
  fontWeight: 700,
}

const visibilityIconButtonStyle: CSSProperties = {
  width: 42,
  height: 42,
  borderRadius: 12,
  background: 'var(--panel-floating)',
  border: '1px solid var(--border)',
  boxShadow: '0 10px 28px rgba(0,0,0,0.18)',
  backdropFilter: 'blur(10px)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  pointerEvents: 'auto',
}

interface SAMPoint { x: number; y: number; label: 0 | 1 }

interface SAMCandidate {
  contours: [number, number][][]
  score: number
  area: number
}

const spinnerStyle: CSSProperties = {
  width: 14,
  height: 14,
  borderRadius: '50%',
  border: '2px solid rgba(255,255,255,0.18)',
  borderTopColor: 'var(--accent)',
  animation: 'spin 0.8s linear infinite',
}

interface SamRunMeta {
  processingTimeMs: number
  mode: 'point'
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
  const userZoomedRef = useRef(false)

  // 'anonymous' crossOrigin: required so Konva canvas stays untainted when
  // we call toDataURL() for SAM prediction. Works because localfile:// serves
  // Access-Control-Allow-Origin: * headers (corsEnabled:true in main/index.ts).
  const [loadedImg] = useImage(toLocalFileUrl(image.file_path), 'anonymous')

  // Use browser-reported natural dimensions (EXIF-corrected) when image is loaded;
  // fall back to DB-stored dimensions while loading.
  const imgW = loadedImg?.naturalWidth || image.width
  const imgH = loadedImg?.naturalHeight || image.height

  // Tool state
  const [bboxStart, setBboxStart] = useState<NormalizedPoint | null>(null)
  const [bboxCurrent, setBboxCurrent] = useState<NormalizedPoint | null>(null)
  const [polygonPoints, setPolygonPoints] = useState<NormalizedPoint[]>([])
  const [mousePos, setMousePos] = useState<NormalizedPoint | null>(null)
  const isPanning = useRef(false)
  const lastPointer = useRef({ x: 0, y: 0 })
  const previousToolRef = useRef<ToolType>(activeTool)

  // SAM tool state
  const [samPoints, setSamPoints] = useState<SAMPoint[]>([])
  const [samContours, setSamContours] = useState<[number, number][][] | null>(null)
  const [samCandidates, setSamCandidates] = useState<SAMCandidate[]>([])
  const [samLoading, setSamLoading] = useState(false)
  const [samLastRun, setSamLastRun] = useState<SamRunMeta | null>(null)
  const [samError, setSamError] = useState<string | null>(null)
  const [selectedSamPointIndex, setSelectedSamPointIndex] = useState<number | null>(null)
  const [selectedSamCandidateIndex, setSelectedSamCandidateIndex] = useState(0)
  const [samSessionReady, setSamSessionReady] = useState(false)
  const [samSessionPreparing, setSamSessionPreparing] = useState(false)
  const [samSelectedModelState, setSamSelectedModelState] = useState<'sam2.1' | 'sam3'>('sam2.1')
  const [samPendingModel, setSamPendingModel] = useState<'sam2.1' | 'sam3' | null>(null)
  const samAsyncVersionRef = useRef(0)
  const samCommitPendingRef = useRef(false)

  const { annotations, selectedId, setSelectedId, createAnnotation, updateGeometry } =
    useAnnotationStore()
  const { labels } = useLabelStore()
  const { activeLabelClassId, annotationsVisible, sidecarOnline, sidecarRuntime, setSidecarRuntime, toggleAnnotationsVisible } = useUIStore()
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
    userZoomedRef.current = false
    if (!containerRef.current) return
    const { clientWidth: w, clientHeight: h } = containerRef.current
    if (w > 0 && h > 0) {
      setStageSize({ width: w, height: h })
      fitImage(w, h)
    }
  }, [image.id, image.width, image.height]) // eslint-disable-line react-hooks/exhaustive-deps

  // Re-fit when image finishes loading so EXIF-corrected naturalWidth/Height are used
  useEffect(() => {
    userZoomedRef.current = false
    if (!containerRef.current || !loadedImg) return
    const { clientWidth: w, clientHeight: h } = containerRef.current
    if (w > 0 && h > 0) {
      setStageSize({ width: w, height: h })
      fitImage(w, h)
    }
  }, [loadedImg]) // eslint-disable-line react-hooks/exhaustive-deps

  // Resize observer — also re-fits image if user hasn't manually zoomed
  useEffect(() => {
    if (!containerRef.current) return
    const observer = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect
      if (width === 0 || height === 0) return
      setStageSize({ width, height })
      if (!userZoomedRef.current) {
        fitImage(width, height)
      }
    })
    observer.observe(containerRef.current)
    return () => observer.disconnect()
  }, [image.id, image.width, image.height]) // eslint-disable-line react-hooks/exhaustive-deps

  const fitImage = (containerW: number, containerH: number) => {
    if (!imgW || !imgH) return
    const margin = 40
    const scaleX = (containerW - margin * 2) / imgW
    const scaleY = (containerH - margin * 2) / imgH
    // Always fit to canvas (no scale=1 ceiling) so image fills canvas proportionally
    const newScale = Math.min(scaleX, scaleY)
    const dW = imgW * newScale
    const dH = imgH * newScale
    setScale(newScale)
    setImgX((containerW - dW) / 2)
    setImgY((containerH - dH) / 2)
  }

  // Displayed image dimensions in stage pixels (single scale application — no double scaling)
  const dispW = imgW * scale
  const dispH = imgH * scale

  const applyScaleAt = useCallback((nextScale: number, anchorX: number, anchorY: number) => {
    userZoomedRef.current = true
    const clamped = Math.max(MIN_SCALE, Math.min(MAX_SCALE, nextScale))
    const ratio = clamped / scale
    setScale(clamped)
    setImgX(anchorX - (anchorX - imgX) * ratio)
    setImgY(anchorY - (anchorY - imgY) * ratio)
  }, [scale, imgX, imgY])

  const zoomPercent = Math.round(scale * 100)

  const stepZoom = useCallback((direction: 'in' | 'out') => {
    const factor = direction === 'in' ? 1.12 : 1 / 1.12
    applyScaleAt(scale * factor, stageSize.width / 2, stageSize.height / 2)
  }, [applyScaleAt, scale, stageSize.height, stageSize.width])

  /** Convert stage pixel position to normalized image coordinates (0–1) */
  const toNormalized = useCallback((stageX: number, stageY: number): NormalizedPoint => {
    const nx = (stageX - imgX) / (imgW * scale)
    const ny = (stageY - imgY) / (imgH * scale)
    return { x: Math.max(0, Math.min(1, nx)), y: Math.max(0, Math.min(1, ny)) }
  }, [imgX, imgY, imgW, imgH, scale])

  const isPointerInsideImage = useCallback((stageX: number, stageY: number) => {
    return stageX >= imgX && stageX <= imgX + dispW && stageY >= imgY && stageY <= imgY + dispH
  }, [dispH, dispW, imgX, imgY])

  const getPointerNorm = useCallback((strict = false): NormalizedPoint | null => {
    const stage = stageRef.current
    if (!stage) return null
    const pos = stage.getPointerPosition()
    if (!pos) return null
    if (strict && !isPointerInsideImage(pos.x, pos.y)) return null
    return toNormalized(pos.x, pos.y)
  }, [isPointerInsideImage, toNormalized])

  const getActiveLabelId = useCallback((): string | null => {
    return activeLabelClassId ?? labels[0]?.id ?? null
  }, [activeLabelClassId, labels])

  // Convert loaded image to base64 once for SAM session preparation
  const getImageBase64 = useCallback((): string | null => {
    if (!loadedImg) return null
    const canvas = document.createElement('canvas')
    canvas.width = imgW
    canvas.height = imgH
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(loadedImg, 0, 0, imgW, imgH)
    return canvas.toDataURL('image/jpeg', 0.85).split(',')[1]
  }, [loadedImg, imgW, imgH])

  const prepareSAMSession = useCallback(async (force = false): Promise<boolean> => {
    if (samSessionReady && !force) return true
    const base64 = getImageBase64()
    if (!base64) return false
    const version = samAsyncVersionRef.current

    setSamSessionPreparing(true)
    try {
      const result = await sidecarClient.samPrepareSession({
        image_key: image.id,
        image_base64: base64,
      })
      if (version !== samAsyncVersionRef.current) return false
      setSidecarRuntime(result.runtime)
      setSamSessionReady(true)
      return true
    } catch (err) {
      if (version !== samAsyncVersionRef.current) return false
      console.warn('SAM session prepare failed:', err)
      setSamSessionReady(false)
      setSamError(err instanceof Error ? err.message : String(err))
      return false
    } finally {
      if (version === samAsyncVersionRef.current) {
        setSamSessionPreparing(false)
      }
    }
  }, [getImageBase64, image.id, samSessionReady])

  // Run SAM prediction with current points (point-prompt mode)
  const runSAMPrediction = useCallback(async (points: SAMPoint[]) => {
    if (points.length === 0) {
      samAsyncVersionRef.current += 1
      setSamContours(null)
      setSamCandidates([])
      setSelectedSamCandidateIndex(0)
      setSamLastRun(null)
      setSamError(null)
      setSamLoading(false)
      setSamSessionPreparing(false)
      return
    }
    const version = samAsyncVersionRef.current + 1
    samAsyncVersionRef.current = version
    const ready = await prepareSAMSession()
    if (!ready || version !== samAsyncVersionRef.current) return
    setSamLoading(true)
    setSamError(null)
    try {
      const result = await sidecarClient.samPredict({
        image_key: image.id,
        points: points.map((p) => [p.x, p.y]),
        point_labels: points.map((p) => p.label),
        multimask: true,
      })
      if (version !== samAsyncVersionRef.current) return
      setSidecarRuntime(result.runtime)
      setSamCandidates(result.candidates ?? [{ contours: result.contours, score: result.score, area: 0 }])
      setSelectedSamCandidateIndex(0)
      setSamContours(result.contours)
      setSamLastRun({
        processingTimeMs: result.processing_time_ms,
        mode: 'point',
        deviceLabel: result.runtime.device_label,
        acceleration: result.runtime.acceleration,
      })
    } catch (err) {
      if (version !== samAsyncVersionRef.current) return
      console.warn('SAM prediction failed:', err)
      setSamContours(null)
      setSamCandidates([])
      setSelectedSamCandidateIndex(0)
      setSamLastRun(null)
      setSamError(err instanceof Error ? err.message : String(err))
    } finally {
      if (version === samAsyncVersionRef.current) {
        setSamLoading(false)
      }
    }
  }, [image.id, prepareSAMSession])

  const removeSamPoint = useCallback((index: number) => {
    setSamPoints((current) => {
      const next = current.filter((_, pointIndex) => pointIndex !== index)
      runSAMPrediction(next).catch(console.error)
      return next
    })
    setSelectedSamPointIndex((current) => {
      if (current == null) return null
      if (current === index) return null
      return current > index ? current - 1 : current
    })
  }, [runSAMPrediction])

  const applySamCandidate = useCallback((index: number) => {
    setSelectedSamCandidateIndex(index)
    const candidate = samCandidates[index]
    setSamContours(candidate?.contours ?? null)
  }, [samCandidates])


  // ─── Wheel zoom ─────────────────────────────────────────────────────────────
  const handleWheel = useCallback((e: Konva.KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault()
    const stage = stageRef.current
    if (!stage) return
    const pointer = stage.getPointerPosition()
    if (!pointer) return
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
    const norm = getPointerNorm(activeTool === 'sam')
    if (!norm) return

    if (e.evt.button !== 0) return

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
      setSelectedSamPointIndex(null)
      const newPoints = [...samPoints, { x: norm.x, y: norm.y, label: 1 as const }]
      setSamPoints(newPoints)
      runSAMPrediction(newPoints).catch(console.error)
    }
  }, [activeTool, polygonPoints, samPoints, getPointerNorm, createAndNotify, image.id, getActiveLabelId, runSAMPrediction])

  // SAM right-click = negative point
  const handleStageContextMenu = useCallback((e: Konva.KonvaEventObject<MouseEvent>) => {
    if (activeTool !== 'sam') return
    e.evt.preventDefault()
    const norm = getPointerNorm(true)
    if (!norm) return
    setSelectedSamPointIndex(null)
    const newPoints = [...samPoints, { x: norm.x, y: norm.y, label: 0 as const }]
    setSamPoints(newPoints)
    runSAMPrediction(newPoints).catch(console.error)
  }, [activeTool, samPoints, getPointerNorm, runSAMPrediction])

  const finalizePolygon = useCallback(async () => {
    if (polygonPoints.length < 3) return
    const geometry: AnnotationGeometry = {
      type: 'polygon',
      points: polygonPoints.map(({ x, y }) => [x, y]),
    }
    await createAndNotify(image.id, 'polygon', geometry, getActiveLabelId())
    setPolygonPoints([])
  }, [polygonPoints, createAndNotify, image.id, getActiveLabelId])

  // F / 0 = fit to view
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.key === 'f' || e.key === '0') {
        userZoomedRef.current = false
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

  const pointInPolygon = (points: [number, number][], point: NormalizedPoint) => {
    if (points.length < 3) return false
    let inside = false
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
      const [xi, yi] = points[i]
      const [xj, yj] = points[j]
      const intersects = ((yi > point.y) !== (yj > point.y))
        && (point.x < ((xj - xi) * (point.y - yi)) / ((yj - yi) || Number.EPSILON) + xi)
      if (intersects) inside = !inside
    }
    return inside
  }

  const pointNearSegment = (point: NormalizedPoint, a: [number, number], b: [number, number], thresholdPx = 10) => {
    const ax = a[0] * dispW
    const ay = a[1] * dispH
    const bx = b[0] * dispW
    const by = b[1] * dispH
    const px = point.x * dispW
    const py = point.y * dispH
    const abx = bx - ax
    const aby = by - ay
    const len2 = abx * abx + aby * aby
    const t = len2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * abx + (py - ay) * aby) / len2)) : 0
    const nx = ax + t * abx
    const ny = ay + t * aby
    return Math.hypot(px - nx, py - ny) <= thresholdPx
  }

  const annotationContainsPoint = useCallback((annotationId: string, point: NormalizedPoint) => {
    const annotation = annotations.find((ann) => ann.id === annotationId)
    if (!annotation) return false

    if (annotation.annotation_type === 'bbox') {
      const geo = annotation.geometry
      if (geo.type !== 'bbox') return false
      return point.x >= geo.x && point.x <= geo.x + geo.width && point.y >= geo.y && point.y <= geo.y + geo.height
    }

    if (annotation.annotation_type === 'polygon') {
      const geo = annotation.geometry
      if (geo.type !== 'polygon') return false
      return pointInPolygon(geo.points, point)
    }

    if (annotation.annotation_type === 'polyline') {
      const geo = annotation.geometry
      if (geo.type !== 'polyline') return false
      return geo.points.some((curr, index) => index > 0 && pointNearSegment(point, geo.points[index - 1], curr))
    }

    if (annotation.annotation_type === 'mask') {
      const geo = annotation.geometry
      if (geo.type !== 'mask') return false
      return geo.contours.some((contour) => pointInPolygon(contour, point))
    }

    if (annotation.annotation_type === 'keypoints') {
      const geo = annotation.geometry
      if (geo.type !== 'keypoints') return false
      const threshold = 10 / Math.max(Math.min(dispW, dispH), 1)
      return geo.keypoints.some((kp) => Math.hypot(point.x - kp.x, point.y - kp.y) <= threshold)
    }

    return false
  }, [annotations, dispW, dispH])

  const handleAnnotationSelectionAtPointer = useCallback((clickedId: string) => {
    const stage = stageRef.current
    const pointer = stage?.getPointerPosition()
    if (!pointer) {
      setSelectedId(clickedId)
      return true
    }

    const point = toNormalized(pointer.x, pointer.y)
    const candidates = annotations.filter((ann) => annotationContainsPoint(ann.id, point)).map((ann) => ann.id)
    const ordered = [clickedId, ...candidates.filter((id) => id !== clickedId)]

    if (ordered.length === 0) {
      setSelectedId(clickedId)
      return true
    }

    if (ordered.length === 1) {
      if (selectedId !== clickedId) {
        setSelectedId(clickedId)
        return true
      }
      return false
    }

    if (selectedId == null || !ordered.includes(selectedId)) {
      setSelectedId(clickedId)
      return true
    }

    const nextId = ordered[(ordered.indexOf(selectedId) + 1) % ordered.length]
    setSelectedId(nextId)
    return true
  }, [annotations, annotationContainsPoint, selectedId, setSelectedId, toNormalized])

  const activeSamLabel = labels.find((label) => label.id === getActiveLabelId()) ?? null
  const samPreviewColor = activeSamLabel?.color ?? 'var(--accent)'
  const samPreviewFill = activeSamLabel?.color != null ? `${activeSamLabel.color}33` : 'rgba(var(--accent-rgb),0.18)'
  const samPreviewLabel = activeSamLabel?.name ?? t('annotationList.unlabeled')

  const formatSamMs = (value: number) => {
    if (value >= 1000) return `${(value / 1000).toFixed(1)}s`
    return `${Math.round(value)}ms`
  }

  const getContourArea = (contour: [number, number][]) => {
    if (contour.length < 3) return 0

    let sum = 0
    for (let i = 0; i < contour.length; i += 1) {
      const [x1, y1] = contour[i]
      const [x2, y2] = contour[(i + 1) % contour.length]
      sum += x1 * y2 - x2 * y1
    }
    return Math.abs(sum) / 2
  }

  const contourContainsPoint = (contour: [number, number][], point: NormalizedPoint) => {
    if (contour.length < 3) return false

    let inside = false
    for (let i = 0, j = contour.length - 1; i < contour.length; j = i++) {
      const [xi, yi] = contour[i]
      const [xj, yj] = contour[j]
      const intersects = ((yi > point.y) !== (yj > point.y))
        && (point.x < ((xj - xi) * (point.y - yi)) / ((yj - yi) || Number.EPSILON) + xi)
      if (intersects) inside = !inside
    }
    return inside
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

  const pickSmallestContour = (contours: [number, number][][]) => contours.reduce((best, contour) => (
    getContourArea(contour) < getContourArea(best) ? contour : best
  ))

  const negativeRadiusPx = Math.max(12, Math.round(Math.min(imgW, imgH) * 0.02))

  const pointToSegmentDistancePx = (
    point: NormalizedPoint,
    a: [number, number],
    b: [number, number],
  ) => {
    const px = point.x * imgW
    const py = point.y * imgH
    const ax = a[0] * imgW
    const ay = a[1] * imgH
    const bx = b[0] * imgW
    const by = b[1] * imgH
    const abx = bx - ax
    const aby = by - ay
    const denom = abx * abx + aby * aby
    if (denom <= Number.EPSILON) {
      return Math.hypot(px - ax, py - ay)
    }
    const t = Math.max(0, Math.min(1, (((px - ax) * abx) + ((py - ay) * aby)) / denom))
    const projX = ax + (t * abx)
    const projY = ay + (t * aby)
    return Math.hypot(px - projX, py - projY)
  }

  const contourNegativePenalty = (contour: [number, number][], point: NormalizedPoint) => {
    if (contourContainsPoint(contour, point)) return 1
    let minDistance = Number.POSITIVE_INFINITY
    for (let index = 0; index < contour.length; index += 1) {
      const a = contour[index]
      const b = contour[(index + 1) % contour.length]
      minDistance = Math.min(minDistance, pointToSegmentDistancePx(point, a, b))
    }
    if (!Number.isFinite(minDistance) || minDistance >= negativeRadiusPx) return 0
    return Math.max(0, 1 - (minDistance / negativeRadiusPx))
  }

  const rankContours = (contours: [number, number][][]) => [...contours].sort((a, b) => {
    const positiveHitsA = positiveSamPoints.filter((point) => contourContainsPoint(a, point)).length
    const positiveHitsB = positiveSamPoints.filter((point) => contourContainsPoint(b, point)).length
    if (positiveHitsA !== positiveHitsB) return positiveHitsB - positiveHitsA

    const negativePenaltyA = negativeSamPoints.reduce((sum, point) => sum + contourNegativePenalty(a, point), 0)
    const negativePenaltyB = negativeSamPoints.reduce((sum, point) => sum + contourNegativePenalty(b, point), 0)
    if (Math.abs(negativePenaltyA - negativePenaltyB) > 1e-6) return negativePenaltyA - negativePenaltyB

    const negativeHitsA = negativeSamPoints.filter((point) => contourContainsPoint(a, point)).length
    const negativeHitsB = negativeSamPoints.filter((point) => contourContainsPoint(b, point)).length
    if (negativeHitsA !== negativeHitsB) return negativeHitsA - negativeHitsB

    return getContourArea(a) - getContourArea(b)
  })

  const positiveSamPoint = [...samPoints].reverse().find((point) => point.label === 1) ?? null
  const positiveSamPoints = samPoints.filter((point) => point.label === 1)
  const negativeSamPoints = samPoints.filter((point) => point.label === 0)
  const activeSamCandidate = samCandidates[selectedSamCandidateIndex] ?? null
  const resolvedSamContours = (() => {
    const candidateContours = activeSamCandidate?.contours ?? samContours
    if (candidateContours == null || candidateContours.length === 0) return []

    const filteredByNegative = negativeSamPoints.length === 0
      ? candidateContours
      : candidateContours.filter((contour) => !negativeSamPoints.some((point) => contourContainsPoint(contour, point)))
    const preferredContours = filteredByNegative.length > 0 ? filteredByNegative : candidateContours

    if (positiveSamPoints.length > 1) {
      const containingAll = preferredContours.filter((contour) => positiveSamPoints.every((point) => contourContainsPoint(contour, point)))
      if (containingAll.length > 0) {
        return [pickSmallestContour(containingAll)]
      }
      return [rankContours(preferredContours)[0]]
    }

    if (positiveSamPoint != null) {
      const containing = preferredContours.filter((contour) => contourContainsPoint(contour, positiveSamPoint))
      if (containing.length > 0) {
        return [pickSmallestContour(containing)]
      }
      return [rankContours(preferredContours)[0]]
    }

    return [rankContours(preferredContours)[0]]
  })()

  const clearSAMState = useCallback(() => {
    samAsyncVersionRef.current += 1
    setSamPoints([])
    setSamContours(null)
    setSamCandidates([])
    setSamLastRun(null)
    setSamError(null)
    setSamLoading(false)
    setSamSessionPreparing(false)
    setSelectedSamPointIndex(null)
    setSelectedSamCandidateIndex(0)
  }, [])

  const handleSamModelSwitch = useCallback(async (modelName: 'sam2.1' | 'sam3') => {
    setSamSelectedModelState(modelName)
    setSamPendingModel(modelName)
    setSamSessionReady(false)
    clearSAMState()
    const version = samAsyncVersionRef.current
    try {
      const result = await sidecarClient.samSetModel({ model_name: modelName })
      if (version !== samAsyncVersionRef.current) return
      setSidecarRuntime(result.runtime)
    } catch (err) {
      if (version !== samAsyncVersionRef.current) return
      setSamSelectedModelState((sidecarRuntime?.sam_model_preference ?? sidecarRuntime?.sam_model_name ?? 'sam2.1') as 'sam2.1' | 'sam3')
      setSamError(err instanceof Error ? err.message : String(err))
    } finally {
      if (version === samAsyncVersionRef.current) {
        setSamPendingModel(null)
      }
    }
  }, [clearSAMState, setSidecarRuntime, sidecarRuntime?.sam_model_name, sidecarRuntime?.sam_model_preference])

  const commitSAM = useCallback(async () => {
    if (resolvedSamContours.length === 0 || samCommitPendingRef.current) return
    samCommitPendingRef.current = true
    const labelId = getActiveLabelId()
    const geometry: AnnotationGeometry = {
      type: 'polygon',
      points: resolvedSamContours[0].map(([x, y]) => [x, y]),
    }

    try {
      await createAndNotify(image.id, 'polygon', geometry, labelId)
      clearSAMState()
    } finally {
      samCommitPendingRef.current = false
    }
  }, [resolvedSamContours, createAndNotify, image.id, getActiveLabelId, clearSAMState])

  useEffect(() => {
    const previousTool = previousToolRef.current

    if (previousTool === 'sam' && activeTool !== 'sam') {
      if (activeTool !== 'null' && resolvedSamContours.length > 0) {
        commitSAM().catch(console.error)
      } else {
        clearSAMState()
      }
    }

    previousToolRef.current = activeTool
  }, [activeTool, clearSAMState, commitSAM, resolvedSamContours.length])

  useEffect(() => {
    clearSAMState()
    setSamSessionReady(false)
  }, [image.id, clearSAMState])

  useEffect(() => {
    if (!loadedImg || !sidecarOnline || activeTool !== 'sam') return
    prepareSAMSession(true).catch(console.error)
  }, [activeTool, loadedImg, image.id, prepareSAMSession, sidecarOnline])

  useEffect(() => {
    const runtimeModel = sidecarRuntime?.sam_model_preference ?? sidecarRuntime?.sam_model_name
    if (runtimeModel === 'sam2.1' || runtimeModel === 'sam3') {
      setSamSelectedModelState(runtimeModel)
    }
  }, [sidecarRuntime?.sam_model_name, sidecarRuntime?.sam_model_preference])

  // Escape cancels in-progress drawing; Enter finishes current polygon or commits SAM
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.key === 'Escape') {
        setBboxStart(null); setBboxCurrent(null); setPolygonPoints([])
        clearSAMState()
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && activeTool === 'sam' && selectedSamPointIndex != null) {
        e.preventDefault()
        removeSamPoint(selectedSamPointIndex)
      }
      if (e.key === 'Enter' && activeTool === 'sam') {
        commitSAM().catch(console.error)
      }
      if (e.key === 'Enter' && activeTool === 'polygon') {
        finalizePolygon().catch(console.error)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [activeTool, clearSAMState, commitSAM, finalizePolygon, removeSamPoint, selectedSamPointIndex])

  const samPreviewTags = (() => {
    const tagWidth = Math.max(72, samPreviewLabel.length * 7 + 16)
    const clampTag = (left: number, top: number) => ({
      left: Math.max(imgX + 4, Math.min(imgX + dispW - tagWidth - 4, left)),
      top: Math.max(imgY + 4, Math.min(imgY + dispH - 24, top)),
      width: tagWidth,
    })

    if (resolvedSamContours.length > 0) {
      return resolvedSamContours.map((contour, index) => {
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
  const samHeaderMeta = samLastRun != null
    ? formatSamMs(samLastRun.processingTimeMs)
    : null
  const samStatusText = samSessionPreparing
    ? (language === 'ko' ? '세션 준비 중...' : 'Preparing session...')
    : samLoading
      ? (language === 'ko' ? '마스크 생성 중...' : 'Generating mask...')
      : null
  const samModelLabel = language === 'ko' ? '모델' : 'Model'
  const samCandidateLabel = language === 'ko' ? '후보' : 'Candidates'
  const samClearLabel = language === 'ko' ? '초기화' : 'Clear'
  const samCommitLabel = language === 'ko' ? '확정' : 'Commit'
  const samModelOptions = [
    { value: 'sam2.1' as const, label: language === 'ko' ? 'SAM2 (빠름)' : 'SAM2 (fast)' },
    { value: 'sam3' as const, label: language === 'ko' ? 'SAM3 (정밀)' : 'SAM3 (quality)' },
  ]
  const selectedSamModel = samPendingModel ?? samSelectedModelState

  const cursor =
    activeTool === 'bbox' || activeTool === 'polygon'
    || activeTool === 'keypoint' || activeTool === 'sam'
      ? 'crosshair'
      : 'default'

  useEffect(() => {
    const nextCursor = cursor
    stageRef.current?.container().style.setProperty('cursor', nextCursor)
    containerRef.current?.style.setProperty('cursor', nextCursor)
  }, [annotations.length, cursor, selectedId])

  useEffect(() => {
    if (selectedId != null && !annotations.some((annotation) => annotation.id === selectedId)) {
      setSelectedId(null)
    }
  }, [annotations, selectedId, setSelectedId])

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%', cursor, position: 'relative' }}>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      <Stage
        ref={stageRef}
        width={stageSize.width}
        height={stageSize.height}
        onWheel={handleWheel}
        onMouseDown={handleStageMouseDown}
        onMouseMove={handleStageMouseMove}
        onMouseUp={handleStageMouseUp}
        onClick={handleStageClick}
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
              listening={activeTool === 'select'}
              draggable={activeTool === 'select'}
              onClick={() => { if (activeTool === 'select') setSelectedId(null) }}
              onDragStart={(e) => e.target.getStage()?.container().style.setProperty('cursor', 'grabbing')}
              onDragMove={(e) => {
                setImgX(e.target.x())
                setImgY(e.target.y())
              }}
              onDragEnd={(e) => {
                setImgX(e.target.x())
                setImgY(e.target.y())
                e.target.getStage()?.container().style.setProperty('cursor', 'grab')
              }}
              onMouseEnter={(e) => {
                if (activeTool === 'select') e.target.getStage()?.container().style.setProperty('cursor', 'grab')
              }}
              onMouseLeave={(e) => e.target.getStage()?.container().style.setProperty('cursor', cursor)}
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
              onSelectAtPointer: () => handleAnnotationSelectionAtPointer(ann.id),
              onUpdateGeometry: (geo: AnnotationGeometry) => updateGeometry(ann.id, geo),
              defaultCursor: cursor,
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
        <Layer listening={activeTool === 'sam'}>
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
              {resolvedSamContours.map((contour, ci) => (
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
                  radius={selectedSamPointIndex === i ? 7 : 6}
                  fill={pt.label === 1 ? '#22c55e' : '#ef4444'}
                  stroke={selectedSamPointIndex === i ? '#fde68a' : 'white'}
                  strokeWidth={selectedSamPointIndex === i ? 3 : 2}
                  onClick={(e) => {
                    e.cancelBubble = true
                    setSelectedSamPointIndex(i)
                  }}
                  onMouseEnter={(e) => e.target.getStage()?.container().style.setProperty('cursor', 'pointer')}
                  onMouseLeave={(e) => e.target.getStage()?.container().style.setProperty('cursor', cursor)}
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
          right: 16,
          top: 16,
          zIndex: 5,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-end',
          gap: 8,
        }}
      >
        <div
          style={{
            minWidth: 214,
            height: 44,
            padding: '0 10px',
            borderRadius: 16,
            background: 'var(--panel-floating)',
            border: '1px solid var(--border)',
            boxShadow: '0 10px 28px rgba(0,0,0,0.18)',
            backdropFilter: 'blur(10px)',
            pointerEvents: 'auto',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
          }}
        >
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', minWidth: 46 }}>
            {zoomPercent}%
          </span>
          <button onClick={() => stepZoom('out')} style={zoomIconButtonStyle} title={language === 'ko' ? '축소' : 'Zoom out'}>-</button>
          <button onClick={() => stepZoom('in')} style={zoomIconButtonStyle} title={language === 'ko' ? '확대' : 'Zoom in'}>+</button>
          <button onClick={() => { userZoomedRef.current = false; fitImage(stageSize.width, stageSize.height) }} style={zoomResetButtonStyle} title={t('canvas.fit')}>
            {t('canvas.fit')}
          </button>
        </div>
      </div>

      <div
        style={{
          position: 'absolute',
          left: 16,
          bottom: 16,
          zIndex: 5,
        }}
      >
        <button
          onClick={toggleAnnotationsVisible}
          title={annotationsVisible ? t('topbar.hideAnnotations') : t('topbar.showAnnotations')}
          style={{
            ...visibilityIconButtonStyle,
            color: annotationsVisible ? 'var(--text-secondary)' : 'var(--accent)',
          }}
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
            <path d="M1.8 9C3.7 5.8 6.1 4.2 9 4.2C11.9 4.2 14.3 5.8 16.2 9C14.3 12.2 11.9 13.8 9 13.8C6.1 13.8 3.7 12.2 1.8 9Z" stroke="currentColor" strokeWidth="1.5" />
            <circle cx="9" cy="9" r="2.3" stroke="currentColor" strokeWidth="1.5" />
            {!annotationsVisible && <path d="M3 15L15 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />}
          </svg>
        </button>
      </div>

      {/* SAM control panel — floats above the canvas when SAM tool is active */}
      {activeTool === 'sam' && (
        <div
          style={{
            position: 'absolute',
            bottom: 16,
            right: 16,
            background: 'var(--panel-floating)',
            border: '1px solid var(--border)',
            borderRadius: 12,
            padding: 9,
            display: 'flex',
            flexDirection: 'column',
            gap: 7,
            width: 232,
            maxWidth: 'calc(100% - 32px)',
            backdropFilter: 'blur(8px)',
            boxShadow: '0 10px 28px rgba(0,0,0,0.28)',
            zIndex: 10,
            pointerEvents: 'auto',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              padding: '4px 8px',
              borderRadius: 999,
              background: 'rgba(var(--accent-rgb),0.14)',
              color: 'var(--accent)',
              fontSize: 11,
              fontWeight: 700,
            }}>
              {t('topbar.smartPolygonTool')}
            </span>
            {samHeaderMeta && <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{samHeaderMeta}</span>}
          </div>

          {samStatusText && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
              {(samSessionPreparing || samLoading) && <span style={spinnerStyle} />}
              <span style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.35 }}>
                {samStatusText}
              </span>
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.04em' }}>
                {samModelLabel}
              </span>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 6 }}>
                {samModelOptions.map((option) => {
                  const active = selectedSamModel === option.value
                  return (
                    <button
                      key={option.value}
                      onClick={() => handleSamModelSwitch(option.value).catch(console.error)}
                      style={{
                        minWidth: 0,
                        minHeight: 32,
                        padding: '6px 8px',
                        borderRadius: 8,
                        border: active ? '1px solid rgba(var(--accent-rgb),0.4)' : '1px solid var(--border)',
                        background: active ? 'rgba(var(--accent-rgb),0.14)' : 'var(--bg-tertiary)',
                        color: active ? 'var(--accent)' : 'var(--text-secondary)',
                        fontSize: 11,
                        fontWeight: 700,
                        textAlign: 'center',
                        lineHeight: 1.25,
                      }}
                    >
                      {option.label}
                    </button>
                  )
                })}
              </div>
            </div>

            {samCandidates.length > 1 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.04em' }}>
                  {samCandidateLabel}
                </span>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 6 }}>
                  {samCandidates.map((candidate, index) => {
                    const containsPositive = positiveSamPoints.length === 0
                      ? true
                      : candidate.contours.some((contour) => positiveSamPoints.every((point) => contourContainsPoint(contour, point)))
                    const active = index === selectedSamCandidateIndex
                    return (
                      <button
                        key={`sam-candidate-${index}`}
                        onClick={() => applySamCandidate(index)}
                        style={{
                          minWidth: 0,
                          padding: '6px 8px',
                          borderRadius: 8,
                          border: active ? '1px solid rgba(var(--accent-rgb),0.4)' : '1px solid var(--border)',
                          background: active ? 'rgba(var(--accent-rgb),0.14)' : 'var(--bg-tertiary)',
                          color: active ? 'var(--accent)' : (containsPositive ? 'var(--text-secondary)' : '#fca5a5'),
                          fontSize: 11,
                          fontWeight: 700,
                        }}
                      >
                        {index + 1}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6 }}>
            <button
              onClick={clearSAMState}
              disabled={samPoints.length === 0}
              style={{
                height: 30,
                padding: '0 10px',
                borderRadius: 8,
                border: '1px solid var(--border)',
                background: 'var(--bg-tertiary)',
                color: 'var(--text-secondary)',
                fontSize: 12,
                fontWeight: 600,
                cursor: samPoints.length === 0 ? 'not-allowed' : 'pointer',
                opacity: samPoints.length === 0 ? 0.45 : 1,
              }}
            >
              {samClearLabel}
            </button>
            <button
              onClick={() => commitSAM().catch(console.error)}
              disabled={resolvedSamContours.length === 0}
              style={{
                height: 30,
                padding: '0 12px',
                borderRadius: 8,
                border: 'none',
                background: resolvedSamContours.length > 0 ? '#22c55e' : 'rgba(34,197,94,0.28)',
                color: resolvedSamContours.length > 0 ? '#07140d' : 'rgba(7,20,13,0.6)',
                fontSize: 12,
                fontWeight: 700,
                cursor: resolvedSamContours.length === 0 ? 'not-allowed' : 'pointer',
              }}
            >
              {samCommitLabel}
            </button>
          </div>

          {sidecarRuntime?.nvidia_gpu_detected && !sidecarRuntime.cuda_available && (
            <div style={{ fontSize: 11, color: 'var(--warning)', lineHeight: 1.45 }}>
              {t('sam.gpuDetectedButUnused')}
            </div>
          )}

          {samError && (
            <div style={{
              padding: '7px 9px',
              borderRadius: 8,
              background: 'rgba(239,68,68,0.12)',
              border: '1px solid rgba(239,68,68,0.28)',
              color: 'var(--danger)',
              fontSize: 11,
              lineHeight: 1.45,
              wordBreak: 'break-word',
            }}>
              {samError}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
