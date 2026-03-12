import { useRef, useEffect, useState } from 'react'
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
  onSelectAtPointer: () => boolean
  onUpdateGeometry: (geo: AnnotationGeometry) => void
  defaultCursor: string
}

export default function BoundingBoxShape({
  annotation, color, isSelected,
  imgX, imgY, imgW, imgH,
  labelName,
  onSelect, onSelectAtPointer, onUpdateGeometry, defaultCursor,
}: Props) {
  const rectRef = useRef<Konva.Rect>(null)
  const transformerRef = useRef<Konva.Transformer>(null)
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })

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
    setDragOffset({ x: 0, y: 0 })
    node.getStage()?.container().style.setProperty('cursor', 'move')
  }

  // Label tag shown above bbox — clamp so it doesn't go above canvas top
  const tagH = 16
  const liveX = x + dragOffset.x
  const liveY = y + dragOffset.y
  const tagY = liveY < tagH ? liveY : liveY - tagH
  const showTag = !!annotation.label_class_id && !!labelName

  const setCursor = (target: { getStage: () => { container: () => HTMLDivElement } | null }, cursor: string) => {
    target.getStage()?.container().style.setProperty('cursor', cursor)
  }

  return (
    <>
      <Rect
        ref={rectRef}
        x={x} y={y} width={w} height={h}
        stroke={color}
        strokeWidth={isSelected ? 2 : 1.5}
        fill={`${color}22`}
        draggable={isSelected}
        onClick={(e) => { e.cancelBubble = true; onSelectAtPointer() }}
        onTap={() => onSelectAtPointer()}
        onDragStart={(e) => { setDragOffset({ x: 0, y: 0 }); setCursor(e.target, 'grabbing') }}
        onDragMove={(e) => setDragOffset({ x: e.target.x() - x, y: e.target.y() - y })}
        onDragEnd={handleDragEnd}
        onTransformEnd={handleTransformEnd}
        onMouseEnter={(e) => setCursor(e.target, isSelected ? 'move' : 'pointer')}
        onMouseLeave={(e) => setCursor(e.target, defaultCursor)}
        perfectDrawEnabled={false}
      />

      {/* Class name label above the bbox */}
      {showTag && (
        <>
          <Rect
            x={liveX} y={tagY}
            width={Math.min(w, Math.max(40, labelName!.length * 7 + 8))}
            height={tagH}
            fill={color}
            cornerRadius={[2, 2, 0, 0]}
            listening={false}
            perfectDrawEnabled={false}
          />
          <Text
            x={liveX + 4} y={tagY + 2}
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
        keepRatio={false}
        borderStroke={color}
        anchorStroke={color}
        anchorFill="white"
        anchorSize={7}
        anchorCornerRadius={2}
      />
    </>
  )
}
