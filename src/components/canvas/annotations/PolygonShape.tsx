import { useState } from 'react'
import { Line, Circle, Text, Rect } from 'react-konva'
import type Konva from 'konva'
import type { Annotation, AnnotationGeometry, PolygonGeometry } from '../../../types'

interface Props {
  annotation: Annotation
  color: string
  isSelected: boolean
  imgX: number; imgY: number; imgW: number; imgH: number
  labelName?: string
  showLabelText?: boolean
  onSelect: () => void
  onSelectAtPointer: () => boolean
  onUpdateGeometry: (geo: AnnotationGeometry) => void
  defaultCursor: string
}

export default function PolygonShape({
  annotation, color, isSelected,
  imgX, imgY, imgW, imgH,
  labelName, showLabelText = true,
  onSelect, onSelectAtPointer, onUpdateGeometry, defaultCursor,
}: Props) {
  const geo = annotation.geometry as PolygonGeometry
  const isClosed = geo.type === 'polygon'
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })
  const [livePoints, setLivePoints] = useState<[number, number][] | null>(null)
  const renderPoints = livePoints ?? geo.points

  // Flatten points for Konva Line: [x1, y1, x2, y2, ...]
  // NOTE: dragOffset is NOT added here — the Line node's own position (set by
  // Konva during drag) already provides the visual offset. Adding it again
  // would cause double-displacement (mask moving 2× while vertices move 1×).
  const flatPoints = renderPoints.flatMap(([nx, ny]) => [
    imgX + nx * imgW,
    imgY + ny * imgH,
  ])

  const handleVertexDragEnd = (index: number, newX: number, newY: number) => {
    const nx = Math.max(0, Math.min(1, (newX - imgX) / imgW))
    const ny = Math.max(0, Math.min(1, (newY - imgY) / imgH))
    const newPoints = geo.points.map(([px, py], i) =>
      i === index ? ([nx, ny] as [number, number]) : ([px, py] as [number, number])
    )
    setLivePoints(null)
    onUpdateGeometry({ ...geo, points: newPoints })
  }

  const handleVertexDragMove = (index: number, newX: number, newY: number) => {
    const nx = Math.max(0, Math.min(1, (newX - imgX) / imgW))
    const ny = Math.max(0, Math.min(1, (newY - imgY) / imgH))
    setLivePoints(geo.points.map(([px, py], i) =>
      i === index ? ([nx, ny] as [number, number]) : ([px, py] as [number, number])
    ))
  }

  // Right-click a vertex to delete it (minimum 3 vertices required for polygon)
  const handleVertexRightClick = (e: Konva.KonvaEventObject<MouseEvent>, index: number) => {
    e.evt.preventDefault()
    e.cancelBubble = true
    if (geo.points.length <= 3) return // can't remove last 3
    const newPoints = geo.points.filter((_, i) => i !== index)
    onUpdateGeometry({ ...geo, points: newPoints })
  }

  const setCursor = (target: { getStage: () => { container: () => HTMLDivElement } | null }, cursor: string) => {
    target.getStage()?.container().style.setProperty('cursor', cursor)
  }

  const clamp = (value: number) => Math.max(0, Math.min(1, value))

  const handlePolygonDragEnd = (e: Konva.KonvaEventObject<DragEvent>) => {
    const node = e.target
    const dx = node.x() / imgW
    const dy = node.y() / imgH
    node.position({ x: 0, y: 0 })
    setDragOffset({ x: 0, y: 0 })

    onUpdateGeometry({
      ...geo,
      points: geo.points.map(([x, y]) => [clamp(x + dx), clamp(y + dy)] as [number, number]),
    })
    setCursor(node, 'move')
  }

  // Click on the edge line to insert a vertex between the two nearest vertices
  const handleEdgeClick = (e: Konva.KonvaEventObject<MouseEvent>) => {
    // Always prevent bubble so stage's polygon-draw handler doesn't add a new point
    e.cancelBubble = true
    if (!isSelected) { onSelectAtPointer(); return }
    if (onSelectAtPointer()) return
    const stage = e.target.getStage()
    if (!stage) return
    const pos = stage.getPointerPosition()
    if (!pos) return

    const clickNx = Math.max(0, Math.min(1, (pos.x - imgX) / imgW))
    const clickNy = Math.max(0, Math.min(1, (pos.y - imgY) / imgH))

    // Find the edge closest to the click point
    const n = renderPoints.length
    let bestEdge = 0
    let bestDist = Infinity

    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n
      const [ax, ay] = renderPoints[i]
      const [bx, by] = renderPoints[j]
      // Point-to-segment distance in normalized space
      const abx = bx - ax; const aby = by - ay
      const len2 = abx * abx + aby * aby
      const t = len2 > 0
        ? Math.max(0, Math.min(1, ((clickNx - ax) * abx + (clickNy - ay) * aby) / len2))
        : 0
      const px = ax + t * abx; const py = ay + t * aby
      const dist = Math.sqrt((clickNx - px) ** 2 + (clickNy - py) ** 2)
      if (dist < bestDist) { bestDist = dist; bestEdge = i }
    }

    // Insert new point after bestEdge index
    const newPoints = [
      ...renderPoints.slice(0, bestEdge + 1),
      [clickNx, clickNy] as [number, number],
      ...renderPoints.slice(bestEdge + 1),
    ]
    setLivePoints(null)
    onUpdateGeometry({ ...geo, points: newPoints })
  }

  // Centroid for label placement
  const cx = flatPoints.length >= 2
    ? flatPoints.filter((_, i) => i % 2 === 0).reduce((a, b) => a + b, 0) / (flatPoints.length / 2)
    : 0
  const cy = flatPoints.length >= 2
    ? flatPoints.filter((_, i) => i % 2 === 1).reduce((a, b) => a + b, 0) / (flatPoints.length / 2)
    : 0

  const showTag = showLabelText && isClosed && !!annotation.label_class_id && !!labelName
  const tagW = Math.max(40, (labelName?.length ?? 0) * 7 + 8)
  const tagH = 16
  const liveCx = cx + dragOffset.x
  const liveCy = cy + dragOffset.y

  return (
    <>
      <Line
        points={flatPoints}
        stroke={color}
        strokeWidth={isSelected ? 2 : 1.5}
        fill={isClosed ? `${color}22` : undefined}
        closed={isClosed}
        draggable={isSelected}
        onClick={handleEdgeClick}
        onTap={onSelect}
        onDragStart={(e) => { onSelect(); setDragOffset({ x: 0, y: 0 }); setCursor(e.target, 'grabbing') }}
        onDragMove={(e) => setDragOffset({ x: e.target.x(), y: e.target.y() })}
        onDragEnd={handlePolygonDragEnd}
        onMouseEnter={(e) => setCursor(e.target, isSelected ? 'move' : 'pointer')}
        onMouseLeave={(e) => setCursor(e.target, defaultCursor)}
        perfectDrawEnabled={false}
        hitStrokeWidth={8}
      />

      {/* Class name label at polygon centroid */}
      {showTag && (
        <>
          <Rect
            x={liveCx - tagW / 2} y={liveCy - tagH / 2}
            width={tagW} height={tagH}
            fill={color}
            opacity={0.85}
            cornerRadius={3}
            listening={false}
            perfectDrawEnabled={false}
          />
          <Text
            x={liveCx - tagW / 2 + 4} y={liveCy - tagH / 2 + 3}
            text={labelName!}
            fontSize={10}
            fontStyle="bold"
            fill="white"
            listening={false}
            perfectDrawEnabled={false}
          />
        </>
      )}

      {/* Vertex handles — right-click to delete, drag to move */}
      {isSelected && renderPoints.map(([nx, ny], i) => (
        <Circle
          key={i}
          x={imgX + nx * imgW + dragOffset.x}
          y={imgY + ny * imgH + dragOffset.y}
          radius={5}
          fill="white"
          stroke={color}
          strokeWidth={1.5}
          draggable
          onDragStart={(e) => { setLivePoints(renderPoints); setCursor(e.target, 'grabbing') }}
          onDragMove={(e) => handleVertexDragMove(i, e.target.x(), e.target.y())}
          onDragEnd={(e) => { handleVertexDragEnd(i, e.target.x(), e.target.y()); setCursor(e.target, 'pointer') }}
          onContextMenu={(e) => handleVertexRightClick(e, i)}
          onClick={(e) => e.cancelBubble = true}
          onMouseEnter={(e) => setCursor(e.target, 'pointer')}
          onMouseLeave={(e) => setCursor(e.target, defaultCursor)}
          perfectDrawEnabled={false}
        />
      ))}
    </>
  )
}
