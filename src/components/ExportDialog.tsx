import { useState } from 'react'
import { exportApi, type ExportResult } from '../api/ipc'
import type { SplitType } from '../types'
import { useI18n } from '../i18n'

interface Props {
  onClose: () => void
}

type Format = 'yolo' | 'coco' | 'voc' | 'csv'

export default function ExportDialog({ onClose }: Props) {
  const { language, t, splitLabel } = useI18n()
  const [format, setFormat] = useState<Format>('yolo')
  const [split, setSplit] = useState<SplitType | 'all'>('all')
  const [includeImages, setIncludeImages] = useState(false)
  const [outputPath, setOutputPath] = useState<string>('')
  const [isExporting, setIsExporting] = useState(false)
  const [result, setResult] = useState<ExportResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const formatOptions: { value: Format; label: string; desc: string }[] = language === 'ko'
    ? [
        { value: 'yolo', label: 'YOLO', desc: 'YOLOv5/v8 txt + data.yaml (박스 및 폴리곤)' },
        { value: 'coco', label: 'COCO JSON', desc: 'MS COCO instances.json (박스 및 세그멘테이션)' },
        { value: 'voc', label: 'Pascal VOC', desc: '이미지별 XML 파일 (Annotations 폴더)' },
        { value: 'csv', label: 'CSV', desc: '단일 CSV 파일 (모든 어노테이션 유형)' },
      ]
    : [
        { value: 'yolo', label: 'YOLO', desc: 'YOLOv5/v8 txt + data.yaml (bbox & polygon)' },
        { value: 'coco', label: 'COCO JSON', desc: 'MS COCO instances.json (bbox & segmentation)' },
        { value: 'voc', label: 'Pascal VOC', desc: 'XML per image (Annotations/ folder)' },
        { value: 'csv', label: 'CSV', desc: 'Single CSV file (all annotation types)' },
      ]

  const splitOptions: { value: SplitType | 'all'; label: string }[] = [
    { value: 'all', label: language === 'ko' ? '전체 이미지' : 'All images' },
    { value: 'train', label: language === 'ko' ? `${splitLabel('train')}만` : 'Train only' },
    { value: 'val', label: language === 'ko' ? `${splitLabel('val')}만` : 'Val only' },
    { value: 'test', label: language === 'ko' ? `${splitLabel('test')}만` : 'Test only' },
  ]

  const text = language === 'ko'
    ? {
        title: '데이터셋 내보내기',
        format: '포맷',
        splitFilter: '분할 필터',
        copyImages: '이미지 파일을 내보내기 폴더로 복사',
        outputFile: '출력 파일',
        outputDirectory: '출력 폴더',
        choosePath: `찾아보기를 눌러 ${format === 'csv' ? '파일' : '폴더'}을 선택하세요`,
        browse: '찾아보기...',
        close: '닫기',
        exporting: '내보내는 중...',
        export: '내보내기',
        exported: `✓ ${result?.file_count ?? 0}개 이미지, ${result?.annotation_count ?? 0}개 어노테이션 내보내기 완료`,
        selectPath: '먼저 출력 경로를 선택하세요.',
        failed: '내보내기에 실패했습니다',
      }
    : {
        title: 'Export Dataset',
        format: 'FORMAT',
        splitFilter: 'SPLIT FILTER',
        copyImages: 'Copy image files to export directory',
        outputFile: 'OUTPUT FILE',
        outputDirectory: 'OUTPUT DIRECTORY',
        choosePath: `Click Browse to select ${format === 'csv' ? 'file' : 'directory'}`,
        browse: 'Browse...',
        close: 'Close',
        exporting: 'Exporting...',
        export: 'Export',
        exported: `✓ Exported ${result?.file_count ?? 0} images, ${result?.annotation_count ?? 0} annotations`,
        selectPath: 'Please select an output path first.',
        failed: 'Export failed',
      }

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
    if (!outputPath) { setError(text.selectPath); return }
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
      setError(e instanceof Error ? e.message : text.failed)
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
            {text.title}
          </span>
          <button onClick={onClose} style={{ color: 'var(--text-muted)', fontSize: 18, background: 'none' }}>✕</button>
        </div>

        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Format selection */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 8 }}>
              {text.format}
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {formatOptions.map((opt) => (
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
              {text.splitFilter}
            </label>
            <div style={{ display: 'flex', gap: 6 }}>
              {splitOptions.map((opt) => (
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
              <span style={{ color: 'var(--text-primary)' }}>{text.copyImages}</span>
            </label>
          )}

          {/* Output path */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 8 }}>
              {format === 'csv' ? text.outputFile : text.outputDirectory}
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{
                flex: 1, padding: '8px 10px', borderRadius: 6,
                border: '1px solid var(--border)', background: 'var(--bg-tertiary)',
                fontSize: 12, color: outputPath ? 'var(--text-primary)' : 'var(--text-muted)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {outputPath || text.choosePath}
              </div>
              <button
                onClick={handlePickPath}
                style={{
                  padding: '8px 14px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                  background: 'var(--bg-tertiary)', border: '1px solid var(--border)',
                  color: 'var(--text-primary)', cursor: 'pointer', whiteSpace: 'nowrap',
                }}
              >
                {text.browse}
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
              {text.exported}
              <div style={{ marginTop: 4, color: 'var(--text-muted)', wordBreak: 'break-all' }}>
                {`-> ${result.output_path}`}
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
            {text.close}
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
            {isExporting ? text.exporting : text.export}
          </button>
        </div>
      </div>
    </div>
  )
}
