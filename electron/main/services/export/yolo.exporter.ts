import { writeFileSync, mkdirSync, copyFileSync, existsSync } from 'fs'
import { join, basename, extname } from 'path'
import { listImages } from '../../db/repositories/image.repo'
import { listForImage } from '../../db/repositories/annotation.repo'
import { listLabels } from '../../db/repositories/label.repo'
import type { YOLOExportOptions, ExportResult } from '../../db/schema'

export async function exportToYOLO(options: YOLOExportOptions): Promise<ExportResult> {
  const { output_dir, include_images, split } = options
  const labels = listLabels()
  const images = listImages(split && split !== 'unassigned' ? { split } : undefined)

  let annotationCount = 0
  let fileCount = 0

  // Directory structure: images/train, images/val, labels/train, labels/val
  const splits = split && split !== 'unassigned'
    ? [split]
    : ['train', 'val', 'test', 'unassigned']

  for (const s of splits) {
    mkdirSync(join(output_dir, 'images', s), { recursive: true })
    mkdirSync(join(output_dir, 'labels', s), { recursive: true })
  }

  for (const image of images) {
    const imgSplit = split && split !== 'unassigned' ? split : (image.split || 'unassigned')
    const annotations = listForImage(image.id).filter((a) =>
      a.annotation_type === 'bbox' || a.annotation_type === 'polygon'
    )

    const lines: string[] = []
    for (const ann of annotations) {
      const labelIdx = labels.findIndex((l) => l.id === ann.label_class_id)
      if (labelIdx < 0) continue

      if (ann.annotation_type === 'bbox' && ann.geometry.type === 'bbox') {
        const { x, y, width, height } = ann.geometry
        const cx = x + width / 2
        const cy = y + height / 2
        lines.push(`${labelIdx} ${cx.toFixed(6)} ${cy.toFixed(6)} ${width.toFixed(6)} ${height.toFixed(6)}`)
      } else if (ann.annotation_type === 'polygon' && ann.geometry.type === 'polygon') {
        const pts = ann.geometry.points.flatMap(([px, py]) => [px.toFixed(6), py.toFixed(6)])
        lines.push(`${labelIdx} ${pts.join(' ')}`)
      }
    }

    const txtName = basename(image.filename, extname(image.filename)) + '.txt'
    const txtPath = join(output_dir, 'labels', imgSplit, txtName)
    writeFileSync(txtPath, lines.join('\n'), 'utf-8')
    annotationCount += lines.length

    if (include_images && existsSync(image.file_path)) {
      const imgDst = join(output_dir, 'images', imgSplit, image.filename)
      copyFileSync(image.file_path, imgDst)
    }
    fileCount++
  }

  // Write data.yaml
  const yaml = [
    `path: ${output_dir}`,
    `train: images/train`,
    `val: images/val`,
    `test: images/test`,
    ``,
    `nc: ${labels.length}`,
    `names: [${labels.map((l) => `'${l.name}'`).join(', ')}]`,
  ].join('\n')
  writeFileSync(join(output_dir, 'data.yaml'), yaml, 'utf-8')

  return { output_path: output_dir, file_count: fileCount, annotation_count: annotationCount }
}
