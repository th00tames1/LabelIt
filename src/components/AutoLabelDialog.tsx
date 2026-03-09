import { useState } from 'react'
import { yoloApi, type ImageAutoLabelResult } from '../api/ipc'
import type { Image } from '../types'
import { useI18n } from '../i18n'

type Target = 'current' | 'unlabeled' | 'all'

interface Props {
  images: Image[]
  activeImageId: string | null
  onClose: () => void
  /** Called when auto-label finishes so the canvas can reload annotations */
  onComplete: (affectedImageIds: string[]) => void
}

export default function AutoLabelDialog({ images, activeImageId, onClose, onComplete }: Props) {
  const { language, t } = useI18n()
  const [modelPath, setModelPath] = useState('yolo11n')
  const [confidence, setConfidence] = useState(0.25)
  const [iou, setIou] = useState(0.45)
  const [target, setTarget] = useState<Target>('current')

  const [isRunning, setIsRunning] = useState(false)
  const [progress, setProgress] = useState(0)          // 0–1
  const [results, setResults] = useState<ImageAutoLabelResult[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const batch = (() => {
    if (target === 'current') {
      const img = images.find((i) => i.id === activeImageId)
      return img ? [img] : []
    }
    if (target === 'unlabeled') return images.filter((i) => i.status === 'unlabeled')
    return images
  })()

  const text = language === 'ko'
    ? {
        title: '자동 라벨링',
        subtitle: 'YOLO 객체 탐지 · 결과는 수동 검토가 필요합니다',
        model: '모델',
        modelHint: 'Ultralytics 형식: yolo11n · yolo11s · yolo11m · yolo11l · yolo11x 또는 전체 .pt 경로',
        confidence: '신뢰도',
        iou: 'IOU 임계값',
        runOn: '실행 대상',
        running: 'YOLO 실행 중...',
        complete: '✓ 완료',
        images: '이미지',
        detections: '탐지 수',
        errors: '오류',
        autoCreated: '⚠ 자동 생성된 라벨 클래스: ',
        reviewHint: '어노테이션은 yolo_auto로 표시됩니다. Annotations 패널에서 각각 승인 또는 거절하세요.',
        selected: `${batch.length}개 이미지 선택됨`,
        close: '닫기',
        run: '▶ 자동 라벨링 실행',
        runningButton: '실행 중...',
        runAgain: '다시 실행',
        current: '현재 이미지',
        unlabeled: `미라벨 이미지 (${images.filter((i) => i.status === 'unlabeled').length})`,
        all: `전체 이미지 (${images.length})`,
        placeholder: 'yolo11n  (이름 또는 절대 .pt 경로)',
        failed: '자동 라벨링에 실패했습니다',
      }
    : {
        title: 'Auto Label',
        subtitle: 'YOLO object detection · results need manual review',
        model: 'Model',
        modelHint: 'Ultralytics format: yolo11n · yolo11s · yolo11m · yolo11l · yolo11x — or full .pt path',
        confidence: 'Confidence',
        iou: 'IOU threshold',
        runOn: 'Run on',
        running: 'Running YOLO...',
        complete: '✓ Complete',
        images: 'Images',
        detections: 'Detections',
        errors: 'Errors',
        autoCreated: '⚠ Auto-created label classes: ',
        reviewHint: 'Annotations are tagged as yolo_auto. Review them in the Annotations panel and accept or reject each one.',
        selected: `${batch.length} image${batch.length !== 1 ? 's' : ''} selected`,
        close: 'Close',
        run: '▶ Run Auto Label',
        runningButton: 'Running...',
        runAgain: 'Run Again',
        current: 'Current image',
        unlabeled: `Unlabeled images (${images.filter((i) => i.status === 'unlabeled').length})`,
        all: `All images (${images.length})`,
        placeholder: 'yolo11n  (name or absolute .pt path)',
        failed: 'Auto-label failed',
      }

  // Derived: which images will be processed
  const targetImages = (): Image[] => {
    if (target === 'current') {
      const img = images.find((i) => i.id === activeImageId)
      return img ? [img] : []
    }
    if (target === 'unlabeled') return images.filter((i) => i.status === 'unlabeled')
    return images
  }

  const handleRun = async () => {
    const batch = targetImages()
    if (batch.length === 0) return

    setError(null)
    setResults(null)
    setIsRunning(true)
    setProgress(0)

    // Process in chunks of 4 to show incremental progress
    const CHUNK = 4
    const allResults: ImageAutoLabelResult[] = []
    let done = 0

    try {
      for (let i = 0; i < batch.length; i += CHUNK) {
        const chunk = batch.slice(i, i + CHUNK)
        const resp = await yoloApi.autoLabel({
          imageIds: chunk.map((img) => img.id),
          modelPath: modelPath.trim() || 'yolo11n',
          confidenceThreshold: confidence,
          iouThreshold: iou,
        })
        allResults.push(...resp.results)
        done += chunk.length
        setProgress(done / batch.length)
      }

      setResults(allResults)
      const affected = allResults
        .filter((r) => r.detectionCount > 0 && !r.error)
        .map((r) => r.imageId)
      onComplete(affected)
    } catch (e) {
      setError(e instanceof Error ? e.message : text.failed)
    } finally {
      setIsRunning(false)
    }
  }

  const totalDetections = results?.reduce((s, r) => s + r.detectionCount, 0) ?? 0
  const errCount = results?.filter((r) => r.error).length ?? 0
  const newClasses = [...new Set(results?.flatMap((r) => r.newLabelClasses) ?? [])]

  const targetLabel: Record<Target, string> = {
    current: text.current,
    unlabeled: text.unlabeled,
    all: text.all,
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.65)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={(e) => { if (e.target === e.currentTarget && !isRunning) onClose() }}
    >
      <div style={{
        width: 460, background: 'var(--bg-secondary)',
        borderRadius: 10, border: '1px solid var(--border)',
        boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          padding: '16px 20px', borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>
              {text.title}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
              {text.subtitle}
            </div>
          </div>
          {!isRunning && (
            <button onClick={onClose} style={{ color: 'var(--text-muted)', fontSize: 18, background: 'none' }}>✕</button>
          )}
        </div>

        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Model path */}
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 5 }}>
              {text.model}
            </label>
            <input
              type="text"
              value={modelPath}
              onChange={(e) => setModelPath(e.target.value)}
              placeholder={text.placeholder}
              disabled={isRunning}
              style={{
                width: '100%', boxSizing: 'border-box',
                padding: '7px 10px', borderRadius: 6,
                border: '1px solid var(--border)', background: 'var(--bg-tertiary)',
                color: 'var(--text-primary)', fontSize: 13, fontFamily: 'monospace',
              }}
            />
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 3 }}>
              {text.modelHint}
            </div>
          </div>

          {/* Confidence + IOU sliders */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            {[
              { label: text.confidence, value: confidence, set: setConfidence, min: 0.01, max: 0.95, step: 0.01 },
              { label: text.iou, value: iou, set: setIou, min: 0.1, max: 0.9, step: 0.05 },
            ].map(({ label, value, set, min, max, step }) => (
              <div key={label}>
                <label style={{
                  fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)',
                  display: 'flex', justifyContent: 'space-between', marginBottom: 5,
                }}>
                  <span>{label}</span>
                  <span style={{ color: 'var(--accent)', fontVariantNumeric: 'tabular-nums' }}>
                    {value.toFixed(2)}
                  </span>
                </label>
                <input
                  type="range" min={min} max={max} step={step} value={value}
                  onChange={(e) => set(parseFloat(e.target.value))}
                  disabled={isRunning}
                  style={{ width: '100%', accentColor: 'var(--accent)' }}
                />
              </div>
            ))}
          </div>

          {/* Target selector */}
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>
              {text.runOn}
            </label>
            <div style={{ display: 'flex', gap: 6 }}>
              {(['current', 'unlabeled', 'all'] as Target[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setTarget(t)}
                  disabled={isRunning}
                  style={{
                    flex: 1, padding: '6px 4px', borderRadius: 6, fontSize: 11, fontWeight: 500,
                    background: target === t ? 'rgba(99,102,241,0.2)' : 'var(--bg-tertiary)',
                    border: `1px solid ${target === t ? 'var(--accent)' : 'var(--border)'}`,
                    color: target === t ? 'var(--accent)' : 'var(--text-secondary)',
                    cursor: isRunning ? 'not-allowed' : 'pointer',
                  }}
                >
                  {targetLabel[t]}
                </button>
              ))}
            </div>
          </div>

          {/* Progress bar */}
          {isRunning && (
            <div>
              <div style={{
                display: 'flex', justifyContent: 'space-between',
                fontSize: 11, color: 'var(--text-muted)', marginBottom: 5,
              }}>
                <span>{text.running}</span>
                <span>{Math.round(progress * 100)}%</span>
              </div>
              <div style={{ height: 6, background: 'var(--bg-tertiary)', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{
                  height: '100%', borderRadius: 3, background: 'var(--accent)',
                  width: `${progress * 100}%`,
                  transition: 'width 0.3s ease',
                }} />
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div style={{
              padding: '8px 12px', borderRadius: 6,
              background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
              fontSize: 12, color: '#f87171',
            }}>{error}</div>
          )}

          {/* Results summary */}
          {results && (
            <div style={{
              padding: '12px 14px', borderRadius: 8,
              background: 'var(--bg-tertiary)', border: '1px solid var(--border)',
            }}>
              <div style={{
                fontSize: 12, fontWeight: 700, color: 'var(--text-primary)',
                marginBottom: 8,
              }}>
                {text.complete}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 8 }}>
                {[
                  { label: text.images, value: results.length },
                  { label: text.detections, value: totalDetections },
                  { label: text.errors, value: errCount },
                ].map(({ label, value }) => (
                  <div key={label} style={{
                    background: 'var(--bg-secondary)', borderRadius: 6, padding: '6px 8px',
                    textAlign: 'center',
                  }}>
                    <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>{value}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{label}</div>
                  </div>
                ))}
              </div>
              {newClasses.length > 0 && (
                <div style={{ fontSize: 11, color: '#facc15', marginTop: 4 }}>
                  {text.autoCreated}{newClasses.join(', ')}
                </div>
              )}
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6, lineHeight: 1.4 }}>
                {text.reviewHint}
              </div>
              {/* Per-image error list */}
              {errCount > 0 && (
                <div style={{ marginTop: 8 }}>
                  {results.filter((r) => r.error).map((r) => (
                    <div key={r.imageId} style={{ fontSize: 10, color: '#f87171', marginTop: 2 }}>
                      {r.imageId.slice(0, 8)}…: {r.error}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '12px 20px', borderTop: '1px solid var(--border)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8,
        }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            {!isRunning && !results && text.selected}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={onClose}
              disabled={isRunning}
              style={{
                padding: '8px 16px', borderRadius: 6, fontSize: 13, fontWeight: 500,
                background: 'var(--bg-tertiary)', border: '1px solid var(--border)',
                color: 'var(--text-secondary)',
                cursor: isRunning ? 'not-allowed' : 'pointer',
                opacity: isRunning ? 0.5 : 1,
              }}
            >
              {results ? text.close : t('common.cancel')}
            </button>
            {!results && (
              <button
                onClick={handleRun}
                disabled={isRunning || batch.length === 0}
                style={{
                  padding: '8px 20px', borderRadius: 6, fontSize: 13, fontWeight: 600,
                  background: isRunning || batch.length === 0 ? 'var(--bg-tertiary)' : 'var(--accent)',
                  border: 'none', color: 'white',
                  cursor: isRunning || batch.length === 0 ? 'not-allowed' : 'pointer',
                  opacity: isRunning || batch.length === 0 ? 0.6 : 1,
                }}
              >
                {isRunning ? text.runningButton : text.run}
              </button>
            )}
            {results && (
              <button
                onClick={() => { setResults(null); setProgress(0) }}
                style={{
                  padding: '8px 20px', borderRadius: 6, fontSize: 13, fontWeight: 600,
                  background: 'var(--accent)', border: 'none', color: 'white', cursor: 'pointer',
                }}
              >
                {text.runAgain}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
