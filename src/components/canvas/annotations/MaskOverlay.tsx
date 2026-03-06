import { Line } from 'react-konva'
import type { Annotation, AnnotationGeometry, MaskGeometry } from '../../../types'

interface Props {
  annotation: Annotation
  color: string
  isSelected: boolean
  imgX: number; imgY: number; imgW: number; imgH: number
  onSelect: () => void
  onUpdateGeometry: (geo: AnnotationGeometry) => void
}

export default function MaskOverlay({
  annotation, color, isSelected,
  imgX, imgY, imgW, imgH,
  onSelect,
}: Props) {
  const geo = annotation.geometry as MaskGeometry

  return (
    <>
      {geo.contours.map((contour, ci) => {
        const flatPoints = contour.flatMap(([nx, ny]) => [
          imgX + nx * imgW,
          imgY + ny * imgH,
        ])
        return (
          <Line
            key={ci}
            points={flatPoints}
            stroke={color}
            strokeWidth={isSelected ? 2 : 1.5}
            fill={`${color}33`}
            closed
            onClick={(e) => { e.cancelBubble = true; onSelect() }}
            perfectDrawEnabled={false}
          />
        )
      })}
    </>
  )
}
