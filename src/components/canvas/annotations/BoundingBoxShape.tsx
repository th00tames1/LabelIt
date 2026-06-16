import { useRef, useEffect, useState } from 'react'
import { Rect, Transformer, Text } from 'react-konva'
import type Konva from 'konva'
import type { Annotation, AnnotationGeometry, BBoxGeometry } from '../../../types'

interface Props {
  annotation: Annotation
  color: string
  isSelected: boolean
  movable?: boolean   // body draggable to move (true only in select mode)
  imgX: number; imgY: number; imgW: number; imgH: number
  labelName?: string
  showLabelText?: boolean
  onSelect: () => void
  onSelectAtPointer: () => boolean
  onUpdateGeometry: (geo: AnnotationGeometry) => void
  defaultCursor: string
}

export default function BoundingBoxShape({
  annotation, color, isSelected, movable = true,
  imgX, imgY, imgW, imgH,
  labelName, showLabelText = true,
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

    // Clamp the resized box to the image rectangle [0,1] so it never spills past
    // the image edges (requirement: boxes auto-fit to image bounds).
    let nx = (node.x() - imgX) / imgW
    let ny = (node.y() - imgY) / imgH
    let nw = (node.width() * scaleX) / imgW
    let nh = (node.height() * scaleY) / imgH
    nx = Math.max(0, Math.min(1, nx))
    ny = Math.max(0, Math.min(1, ny))
    nw = Math.max(0, Math.min(1 - nx, nw))
    nh = Math.max(0, Math.min(1 - ny, nh))

    onUpdateGeometry({ type: 'bbox', x: nx, y: ny, width: nw, height: nh })
  }

  const handleDragEnd = () => {
    const node = rectRef.current!
    // Clamp top-left so the whole box stays inside the image.
    const newX = Math.max(0, Math.min(1 - geo.width, (node.x() - imgX) / imgW))
    const newY = Math.max(0, Math.min(1 - geo.height, (node.y() - imgY) / imgH))
    onUpdateGeometry({ type: 'bbox', x: newX, y: newY, width: geo.width, height: geo.height })
    setDragOffset({ x: 0, y: 0 })
    node.getStage()?.container().style.setProperty('cursor', 'move')
  }

  // Keep the box fully inside the image while dragging (no spill past edges).
  const dragBoundFunc = (pos: { x: number; y: number }) => {
    const maxX = imgX + imgW - w
    const maxY = imgY + imgH - h
    return {
      x: Math.max(imgX, Math.min(maxX, pos.x)),
      y: Math.max(imgY, Math.min(maxY, pos.y)),
    }
  }

  // Clamp the live resize box to the image rectangle (stage pixels) so anchors
  // can't drag the box outside the image.
  const boundBoxFunc = (oldBox: { x: number; y: number; width: number; height: number; rotation: number }, newBox: { x: number; y: number; width: number; height: number; rotation: number }) => {
    const minX = imgX
    const minY = imgY
    const maxX = imgX + imgW
    const maxY = imgY + imgH
    let { x, y, width, height } = newBox
    if (x < minX) { width -= (minX - x); x = minX }
    if (y < minY) { height -= (minY - y); y = minY }
    if (x + width > maxX) width = maxX - x
    if (y + height > maxY) height = maxY - y
    if (width < 4 || height < 4) return oldBox   // reject degenerate boxes
    return { ...newBox, x, y, width, height }
  }

  // Label tag shown above bbox — clamp so it doesn't go above canvas top
  const tagH = 16
  const liveX = x + dragOffset.x
  const liveY = y + dragOffset.y
  const tagY = liveY < tagH ? liveY : liveY - tagH
  const showTag = showLabelText && !!annotation.label_class_id && !!labelName

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
        // Keep the outline a constant pixel width — without this Konva scales the
        // stroke during a resize so the border visibly thickens/thins as you drag.
        strokeScaleEnabled={false}
        fill={`${color}22`}
        draggable={isSelected && movable}
        dragBoundFunc={dragBoundFunc}
        onClick={(e) => { e.cancelBubble = true; onSelectAtPointer() }}
        onTap={() => onSelectAtPointer()}
        onDragStart={(e) => { setDragOffset({ x: 0, y: 0 }); setCursor(e.target, 'grabbing') }}
        onDragMove={(e) => setDragOffset({ x: e.target.x() - x, y: e.target.y() - y })}
        onDragEnd={handleDragEnd}
        onTransformEnd={handleTransformEnd}
        onMouseEnter={(e) => setCursor(e.target, isSelected && movable ? 'move' : 'pointer')}
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

      {/* Always rendered so useEffect can attach/detach nodes reactively.
          Larger anchors + padding make the corner handles easy to grab even when
          boxes overlap; boundBoxFunc keeps the resize inside the image. */}
      <Transformer
        ref={transformerRef}
        rotateEnabled={false}
        flipEnabled={false}
        keepRatio={false}
        borderStroke={color}
        anchorStroke={color}
        anchorFill="white"
        anchorSize={11}
        anchorCornerRadius={2}
        ignoreStroke
        boundBoxFunc={boundBoxFunc}
      />
    </>
  )
}
