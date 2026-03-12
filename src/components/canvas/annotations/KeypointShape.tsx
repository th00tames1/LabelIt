import { Circle, Line } from 'react-konva'
import type { Annotation, AnnotationGeometry, KeypointsGeometry } from '../../../types'

interface Props {
  annotation: Annotation
  color: string
  isSelected: boolean
  imgX: number; imgY: number; imgW: number; imgH: number
  onSelect: () => void
  onSelectAtPointer?: () => boolean
  onUpdateGeometry: (geo: AnnotationGeometry) => void
  defaultCursor: string
}

const VISIBILITY_COLORS = ['transparent', '#ffaa00', '#ffffff']

export default function KeypointShape({
  annotation, color, isSelected,
  imgX, imgY, imgW, imgH,
  onSelect, onSelectAtPointer, onUpdateGeometry, defaultCursor,
}: Props) {
  const geo = annotation.geometry as KeypointsGeometry

  const handleKpDragEnd = (index: number, newX: number, newY: number) => {
    const nx = Math.max(0, Math.min(1, (newX - imgX) / imgW))
    const ny = Math.max(0, Math.min(1, (newY - imgY) / imgH))
    const newKeypoints = geo.keypoints.map((kp, i) =>
      i === index ? { ...kp, x: nx, y: ny } : kp
    )
    onUpdateGeometry({ ...geo, keypoints: newKeypoints })
  }

  const handleKpRightClick = (index: number) => {
    // Cycle visibility
    const newKeypoints = geo.keypoints.map((kp, i) =>
      i === index ? { ...kp, visibility: ((kp.visibility + 1) % 3) as 0 | 1 | 2 } : kp
    )
    onUpdateGeometry({ ...geo, keypoints: newKeypoints })
  }

  const setCursor = (target: { getStage: () => { container: () => HTMLDivElement } | null }, cursor: string) => {
    target.getStage()?.container().style.setProperty('cursor', cursor)
  }

  return (
    <>
      {/* Render keypoint circles */}
      {geo.keypoints.map((kp, i) => {
        if (kp.visibility === 0) return null
        return (
          <Circle
            key={i}
            x={imgX + kp.x * imgW}
            y={imgY + kp.y * imgH}
            radius={isSelected ? 6 : 5}
            fill={VISIBILITY_COLORS[kp.visibility]}
            stroke={color}
            strokeWidth={isSelected ? 2 : 1.5}
            draggable
            onDragStart={(e) => { onSelect(); setCursor(e.target, 'grabbing') }}
            onDragEnd={(e) => { handleKpDragEnd(i, e.target.x(), e.target.y()); setCursor(e.target, 'pointer') }}
            onClick={(e) => { e.cancelBubble = true; (onSelectAtPointer ?? onSelect)() }}
            onContextMenu={(e) => { e.evt.preventDefault(); handleKpRightClick(i) }}
            onMouseEnter={(e) => setCursor(e.target, 'pointer')}
            onMouseLeave={(e) => setCursor(e.target, defaultCursor)}
            perfectDrawEnabled={false}
          />
        )
      })}
    </>
  )
}
