import { Line, Circle } from 'react-konva'
import type { NormalizedPoint } from '../../../types'

interface Props {
  points: NormalizedPoint[]
  mousePos: NormalizedPoint
  imgX: number; imgY: number; imgW: number; imgH: number
  closed?: boolean  // true = polygon (close path), false = polyline (open)
}

export default function PolygonPreview({ points, mousePos, imgX, imgY, imgW, imgH, closed = true }: Props) {
  const toCanvas = (p: NormalizedPoint) => ({
    x: imgX + p.x * imgW,
    y: imgY + p.y * imgH,
  })

  // All placed points + current mouse position
  const allPoints = [...points, mousePos]
  const flatPoints = allPoints.flatMap((p) => {
    const c = toCanvas(p)
    return [c.x, c.y]
  })

  return (
    <>
      <Line
        points={flatPoints}
        stroke="#7c3aed"
        strokeWidth={1.5}
        dash={[4, 3]}
        listening={false}
        perfectDrawEnabled={false}
      />
      {/* Placed vertices */}
      {points.map((p, i) => {
        const c = toCanvas(p)
        return (
          <Circle
            key={i}
            x={c.x} y={c.y}
            radius={i === 0 && closed ? 6 : 4}
            fill={i === 0 && closed ? '#7c3aed' : 'white'}
            stroke="#7c3aed"
            strokeWidth={1.5}
            listening={false}
          />
        )
      })}
    </>
  )
}
