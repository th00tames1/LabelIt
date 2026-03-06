import { writeFileSync, mkdirSync } from 'fs'
import { dirname } from 'path'
import { listImages } from '../../db/repositories/image.repo'
import { listForImage } from '../../db/repositories/annotation.repo'
import { listLabels } from '../../db/repositories/label.repo'
import type { CSVExportOptions, ExportResult } from '../../db/schema'

export async function exportToCSV(options: CSVExportOptions): Promise<ExportResult> {
  const { output_path, split } = options
  mkdirSync(dirname(output_path), { recursive: true })

  const labels = listLabels()
  const images = listImages(split && split !== 'unassigned' ? { split } : undefined)

  const rows: string[] = [
    // Header
    'filename,label,annotation_type,split,x_center,y_center,width,height,points,confidence,source',
  ]

  let annotationCount = 0
  let fileCount = 0

  for (const image of images) {
    const annotations = listForImage(image.id)

    for (const ann of annotations) {
      const label = labels.find((l) => l.id === ann.label_class_id)
      const labelName = label?.name ?? ''

      let xc = '', yc = '', w = '', h = '', points = ''

      if (ann.annotation_type === 'bbox' && ann.geometry.type === 'bbox') {
        const { x, y, width, height } = ann.geometry
        xc = (x + width / 2).toFixed(6)
        yc = (y + height / 2).toFixed(6)
        w = width.toFixed(6)
        h = height.toFixed(6)
      } else if (
        (ann.annotation_type === 'polygon' || ann.annotation_type === 'polyline') &&
        ann.geometry.type === 'polygon'
      ) {
        const pts = ann.geometry.points
        const xs = pts.map(([px]) => px)
        const ys = pts.map(([, py]) => py)
        const minX = Math.min(...xs); const maxX = Math.max(...xs)
        const minY = Math.min(...ys); const maxY = Math.max(...ys)
        xc = ((minX + maxX) / 2).toFixed(6)
        yc = ((minY + maxY) / 2).toFixed(6)
        w = (maxX - minX).toFixed(6)
        h = (maxY - minY).toFixed(6)
        points = `"${pts.map(([px, py]) => `${px.toFixed(4)} ${py.toFixed(4)}`).join(';')}"`
      } else if (ann.annotation_type === 'keypoints' && ann.geometry.type === 'keypoints') {
        points = `"${ann.geometry.keypoints.map((kp) => `${kp.x.toFixed(4)} ${kp.y.toFixed(4)} ${kp.visibility}`).join(';')}"`
      }

      const confidence = ann.confidence != null ? ann.confidence.toFixed(4) : ''
      const row = [
        csvEscape(image.filename),
        csvEscape(labelName),
        ann.annotation_type,
        image.split,
        xc, yc, w, h,
        points,
        confidence,
        ann.source,
      ].join(',')

      rows.push(row)
      annotationCount++
    }

    fileCount++
  }

  writeFileSync(output_path, rows.join('\n'), 'utf-8')

  return {
    output_path,
    file_count: fileCount,
    annotation_count: annotationCount,
  }
}

function csvEscape(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}
