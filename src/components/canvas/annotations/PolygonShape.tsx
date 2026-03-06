import { Line, Circle } from 'react-konva'
import type Konva from 'konva'
import type { Annotation, AnnotationGeometry, PolygonGeometry } from '../../../types'

interface Props {
  annotation: Annotation
  color: string
  isSelected: boolean
  imgX: number; imgY: number; imgW: number; imgH: number
  onSelect: () => void
  onUpdateGeometry: (geo: AnnotationGeometry) => void
}

export default function PolygonShape({
  annotation, color, isSelected,
  imgX, imgY, imgW, imgH,
  onSelect, onUpdateGeometry,
}: Props) {
  const geo = annotation.geometry as PolygonGeometry
  const isClosed = geo.type === 'polygon'

  // Flatten points for Konva Line: [x1, y1, x2, y2, ...]
  const flatPoints = geo.points.flatMap(([nx, ny]) => [
    imgX + nx * imgW,
    imgY + ny * imgH,
  ])

  const handleVertexDragEnd = (index: number, newX: number, newY: number) => {
    const nx = Math.max(0, Math.min(1, (newX - imgX) / imgW))
    const ny = Math.max(0, Math.min(1, (newY - imgY) / imgH))
    const newPoints = geo.points.map(([px, py], i) =>
      i === index ? ([nx, ny] as [number, number]) : ([px, py] as [number, number])
    )
    onUpdateGeometry({ ...geo, points: newPoints })
  }

  // Right-click a vertex to delete it (minimum 3 vertices required for polygon)
  const handleVertexRightClick = (e: Konva.KonvaEventObject<MouseEvent>, index: number) => {
    e.evt.preventDefault()
    e.cancelBubble = true
    if (geo.points.length <= 3) return // can't remove last 3
    const newPoints = geo.points.filter((_, i) => i !== index)
    onUpdateGeometry({ ...geo, points: newPoints })
  }

  // Click on the edge line to insert a vertex between the two nearest vertices
  const handleEdgeClick = (e: Konva.KonvaEventObject<MouseEvent>) => {
    if (!isSelected) { onSelect(); return }
    e.cancelBubble = true
    const stage = e.target.getStage()
    if (!stage) return
    const pos = stage.getPointerPosition()
    if (!pos) return

    const clickNx = Math.max(0, Math.min(1, (pos.x - imgX) / imgW))
    const clickNy = Math.max(0, Math.min(1, (pos.y - imgY) / imgH))

    // Find the edge closest to the click point
    const n = geo.points.length
    let bestEdge = 0
    let bestDist = Infinity

    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n
      const [ax, ay] = geo.points[i]
      const [bx, by] = geo.points[j]
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
      ...geo.points.slice(0, bestEdge + 1),
      [clickNx, clickNy] as [number, number],
      ...geo.points.slice(bestEdge + 1),
    ]
    onUpdateGeometry({ ...geo, points: newPoints })
  }

  return (
    <>
      <Line
        points={flatPoints}
        stroke={color}
        strokeWidth={isSelected ? 2 : 1.5}
        fill={isClosed ? `${color}22` : undefined}
        closed={isClosed}
        onClick={handleEdgeClick}
        onTap={onSelect}
        perfectDrawEnabled={false}
        hitStrokeWidth={8}
      />
      {/* Vertex handles — right-click to delete, drag to move */}
      {isSelected && geo.points.map(([nx, ny], i) => (
        <Circle
          key={i}
          x={imgX + nx * imgW}
          y={imgY + ny * imgH}
          radius={5}
          fill="white"
          stroke={color}
          strokeWidth={1.5}
          draggable
          onDragEnd={(e) => handleVertexDragEnd(i, e.target.x(), e.target.y())}
          onContextMenu={(e) => handleVertexRightClick(e, i)}
          onClick={(e) => e.cancelBubble = true}
          perfectDrawEnabled={false}
        />
      ))}
    </>
  )
}
