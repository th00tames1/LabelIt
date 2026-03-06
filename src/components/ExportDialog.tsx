import { useState } from 'react'
import { exportApi, type ExportResult } from '../api/ipc'
import type { SplitType } from '../types'

interface Props {
  onClose: () => void
}

type Format = 'yolo' | 'coco' | 'voc' | 'csv'

const FORMAT_OPTIONS: { value: Format; label: string; desc: string }[] = [
  { value: 'yolo', label: 'YOLO', desc: 'YOLOv5/v8 txt + data.yaml (bbox & polygon)' },
  { value: 'coco', label: 'COCO JSON', desc: 'MS COCO instances.json (bbox & segmentation)' },
  { value: 'voc', label: 'Pascal VOC', desc: 'XML per image (Annotations/ folder)' },
  { value: 'csv', label: 'CSV', desc: 'Single CSV file (all annotation types)' },
]

const SPLIT_OPTIONS: { value: SplitType | 'all'; label: string }[] = [
  { value: 'all', label: 'All images' },
  { value: 'train', label: 'Train only' },
  { value: 'val', label: 'Val only' },
  { value: 'test', label: 'Test only' },
]

export default function ExportDialog({ onClose }: Props) {
  const [format, setFormat] = useState<Format>('yolo')
  const [split, setSplit] = useState<SplitType | 'all'>('all')
  const [includeImages, setIncludeImages] = useState(false)
  const [outputPath, setOutputPath] = useState<string>('')
  const [isExporting, setIsExporting] = useState(false)
  const [result, setResult] = useState<ExportResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handlePickPath = async () => {
    if (format === 'csv') {
      const path = await exportApi.showCSVSaveDialog()
      if (path) setOutputPath(path)
    } else {
      const dir = await exportApi.showSaveDialog()
      if (dir) setOutputPath(dir)
    }
  }

  const handleExport = async () => {
    if (!outputPath) { setError('Please select an output path first.'); return }
    setError(null)
    setResult(null)
    setIsExporting(true)

    try {
      const splitFilter = split === 'all' ? undefined : split as SplitType
      let res: ExportResult

      if (format === 'yolo') {
        res = await exportApi.toYOLO({ output_dir: outputPath, include_images: includeImages, split: splitFilter })
      } else if (format === 'coco') {
        res = await exportApi.toCOCO({ output_dir: outputPath, split: splitFilter })
      } else if (format === 'voc') {
        res = await exportApi.toVOC({ output_dir: outputPath, include_images: includeImages, split: splitFilter })
      } else {
        res = await exportApi.toCSV({ output_path: outputPath, split: splitFilter })
      }

      setResult(res)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Export failed')
    } finally {
      setIsExporting(false)
    }
  }

  const showIncludeImages = format === 'yolo' || format === 'voc'

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(0,0,0,0.6)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }} onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{
        width: 480, background: 'var(--bg-secondary)',
        borderRadius: 10, border: '1px solid var(--border)',
        boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          padding: '16px 20px', borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>
            Export Dataset
          </span>
          <button onClick={onClose} style={{ color: 'var(--text-muted)', fontSize: 18, background: 'none' }}>✕</button>
        </div>

        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Format selection */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 8 }}>
              FORMAT
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {FORMAT_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setFormat(opt.value)}
                  style={{
                    padding: '10px 12px', borderRadius: 7, textAlign: 'left',
                    border: `1px solid ${format === opt.value ? 'var(--accent)' : 'var(--border)'}`,
                    background: format === opt.value ? 'rgba(99,102,241,0.12)' : 'var(--bg-tertiary)',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ fontSize: 13, fontWeight: 600, color: format === opt.value ? 'var(--accent)' : 'var(--text-primary)' }}>
                    {opt.label}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{opt.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Split filter */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 8 }}>
              SPLIT FILTER
            </label>
            <div style={{ display: 'flex', gap: 6 }}>
              {SPLIT_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setSplit(opt.value)}
                  style={{
                    flex: 1, padding: '6px 0', borderRadius: 6, fontSize: 12, fontWeight: 500,
                    border: `1px solid ${split === opt.value ? 'var(--accent)' : 'var(--border)'}`,
                    background: split === opt.value ? 'rgba(99,102,241,0.12)' : 'var(--bg-tertiary)',
                    color: split === opt.value ? 'var(--accent)' : 'var(--text-secondary)',
                    cursor: 'pointer',
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Include images checkbox */}
          {showIncludeImages && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
              <input
                type="checkbox"
                checked={includeImages}
                onChange={(e) => setIncludeImages(e.target.checked)}
              />
              <span style={{ color: 'var(--text-primary)' }}>Copy image files to export directory</span>
            </label>
          )}

          {/* Output path */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 8 }}>
              {format === 'csv' ? 'OUTPUT FILE' : 'OUTPUT DIRECTORY'}
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{
                flex: 1, padding: '8px 10px', borderRadius: 6,
                border: '1px solid var(--border)', background: 'var(--bg-tertiary)',
                fontSize: 12, color: outputPath ? 'var(--text-primary)' : 'var(--text-muted)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {outputPath || `Click Browse to select ${format === 'csv' ? 'file' : 'directory'}`}
              </div>
              <button
                onClick={handlePickPath}
                style={{
                  padding: '8px 14px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                  background: 'var(--bg-tertiary)', border: '1px solid var(--border)',
                  color: 'var(--text-primary)', cursor: 'pointer', whiteSpace: 'nowrap',
                }}
              >
                Browse…
              </button>
            </div>
          </div>

          {/* Error / result */}
          {error && (
            <div style={{
              padding: '10px 12px', borderRadius: 6,
              background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
              fontSize: 12, color: '#f87171',
            }}>{error}</div>
          )}
          {result && (
            <div style={{
              padding: '10px 12px', borderRadius: 6,
              background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)',
              fontSize: 12, color: '#4ade80',
            }}>
              ✓ Exported {result.file_count} images, {result.annotation_count} annotations
              <div style={{ marginTop: 4, color: 'var(--text-muted)', wordBreak: 'break-all' }}>
                → {result.output_path}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '12px 20px', borderTop: '1px solid var(--border)',
          display: 'flex', justifyContent: 'flex-end', gap: 8,
        }}>
          <button
            onClick={onClose}
            style={{
              padding: '8px 16px', borderRadius: 6, fontSize: 13, fontWeight: 500,
              background: 'var(--bg-tertiary)', border: '1px solid var(--border)',
              color: 'var(--text-secondary)', cursor: 'pointer',
            }}
          >
            Close
          </button>
          <button
            onClick={handleExport}
            disabled={isExporting}
            style={{
              padding: '8px 20px', borderRadius: 6, fontSize: 13, fontWeight: 600,
              background: isExporting ? 'var(--bg-tertiary)' : 'var(--accent)',
              border: 'none', color: 'white', cursor: isExporting ? 'not-allowed' : 'pointer',
              opacity: isExporting ? 0.6 : 1,
            }}
          >
            {isExporting ? 'Exporting…' : 'Export'}
          </button>
        </div>
      </div>
    </div>
  )
}
