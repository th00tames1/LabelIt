import { useRef, useEffect } from 'react'
import { Rect, Transformer, Text } from 'react-konva'
import type Konva from 'konva'
import type { Annotation, AnnotationGeometry, BBoxGeometry } from '../../../types'

interface Props {
  annotation: Annotation
  color: string
  isSelected: boolean
  imgX: number; imgY: number; imgW: number; imgH: number
  labelName?: string
  onSelect: () => void
  onUpdateGeometry: (geo: AnnotationGeometry) => void
}

export default function BoundingBoxShape({
  annotation, color, isSelected,
  imgX, imgY, imgW, imgH,
  labelName,
  onSelect, onUpdateGeometry,
}: Props) {
  const rectRef = useRef<Konva.Rect>(null)
  const transformerRef = useRef<Konva.Transformer>(null)

  const geo = annotation.geometry as BBoxGeometry
  const x = imgX + geo.x * imgW
  const y = imgY + geo.y * imgH
  const w = geo.width * imgW
  const h = geo.height * imgH

  // Attach/detach transformer reactively when isSelected changes
  useEffect(() => {
    if (!transformerRef.current || !rectRef.current) return
    if (isSelected) {
      transformerRef.current.nodes([rectRef.current])
    } else {
      transformerRef.current.nodes([])
    }
    transformerRef.current.getLayer()?.batchDraw()
  }, [isSelected])

  const handleTransformEnd = () => {
    const node = rectRef.current!
    const scaleX = node.scaleX()
    const scaleY = node.scaleY()
    node.scaleX(1)
    node.scaleY(1)

    const newX = Math.max(0, (node.x() - imgX) / imgW)
    const newY = Math.max(0, (node.y() - imgY) / imgH)
    const newW = Math.min(1 - newX, (node.width() * scaleX) / imgW)
    const newH = Math.min(1 - newY, (node.height() * scaleY) / imgH)

    onUpdateGeometry({ type: 'bbox', x: newX, y: newY, width: newW, height: newH })
  }

  const handleDragEnd = () => {
    const node = rectRef.current!
    const newX = Math.max(0, (node.x() - imgX) / imgW)
    const newY = Math.max(0, (node.y() - imgY) / imgH)
    onUpdateGeometry({ type: 'bbox', x: newX, y: newY, width: geo.width, height: geo.height })
  }

  // Label tag shown above bbox — clamp so it doesn't go above canvas top
  const tagH = 16
  const tagY = y < tagH ? y : y - tagH
  const showTag = !!labelName && labelName !== 'Unlabeled'

  return (
    <>
      <Rect
        ref={rectRef}
        x={x} y={y} width={w} height={h}
        stroke={color}
        strokeWidth={isSelected ? 2 : 1.5}
        fill={`${color}22`}
        draggable={isSelected}
        onClick={(e) => { e.cancelBubble = true; onSelect() }}
        onTap={onSelect}
        onDragEnd={handleDragEnd}
        onTransformEnd={handleTransformEnd}
        perfectDrawEnabled={false}
      />

      {/* Class name label above the bbox */}
      {showTag && (
        <>
          <Rect
            x={x} y={tagY}
            width={Math.min(w, Math.max(40, labelName!.length * 7 + 8))}
            height={tagH}
            fill={color}
            cornerRadius={[2, 2, 0, 0]}
            listening={false}
            perfectDrawEnabled={false}
          />
          <Text
            x={x + 4} y={tagY + 2}
            text={labelName!}
            fontSize={10}
            fontStyle="bold"
            fill="white"
            listening={false}
            perfectDrawEnabled={false}
          />
        </>
      )}

      {/* Always rendered so useEffect can attach/detach nodes reactively */}
      <Transformer
        ref={transformerRef}
        rotateEnabled={false}
        flipEnabled={false}
        borderStroke={color}
        anchorStroke={color}
        anchorFill="white"
        anchorSize={7}
        anchorCornerRadius={2}
      />
    </>
  )
}
