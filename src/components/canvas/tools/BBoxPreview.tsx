import { Rect } from 'react-konva'
import type { NormalizedPoint } from '../../../types'

interface Props {
  start: NormalizedPoint
  current: NormalizedPoint
  imgX: number; imgY: number; imgW: number; imgH: number
}

export default function BBoxPreview({ start, current, imgX, imgY, imgW, imgH }: Props) {
  const x = imgX + Math.min(start.x, current.x) * imgW
  const y = imgY + Math.min(start.y, current.y) * imgH
  const w = Math.abs(current.x - start.x) * imgW
  const h = Math.abs(current.y - start.y) * imgH

  return (
    <Rect
      x={x} y={y} width={w} height={h}
      stroke="#7c3aed"
      strokeWidth={1.5}
      fill="rgba(124, 58, 237, 0.1)"
      dash={[4, 3]}
      listening={false}
      perfectDrawEnabled={false}
    />
  )
}
