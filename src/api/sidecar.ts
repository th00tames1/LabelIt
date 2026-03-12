// Typed fetch() wrappers for the Python AI sidecar (port 7842)

import type { SidecarHealth, SidecarRuntimeInfo } from '../types'

const BASE_URL = 'http://127.0.0.1:7842'

async function post<T>(path: string, body: unknown, timeoutMs = 300_000): Promise<T> {
  // Large SAM models on CPU can take 60–180s; 300s timeout for safety
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  })
  if (!res.ok) throw new Error(`Sidecar error: ${res.status} ${await res.text()}`)
  return res.json() as Promise<T>
}

export interface SAMPredictRequest {
  image_key: string
  points: [number, number][]
  point_labels: (0 | 1)[]
  box?: [number, number, number, number] | null
  multimask?: boolean
}

export interface SAMPrepareSessionRequest {
  image_key: string
  image_base64: string
}

export interface SAMPredictResponse {
  contours: [number, number][][]
  score: number
  processing_time_ms: number
  mode: 'point'
  runtime: SidecarRuntimeInfo
}

export interface YOLODetection {
  class_name: string
  confidence: number
  bbox: [number, number, number, number]  // xywh normalized
}

export interface YOLODetectRequest {
  image_base64: string
  model_path: string
  confidence_threshold: number
  iou_threshold: number
}

export interface YOLODetectResponse {
  detections: YOLODetection[]
  processing_time_ms: number
}

export const sidecarClient = {
  health: async (): Promise<SidecarHealth | null> => {
    try {
      const res = await fetch(`${BASE_URL}/health`, { signal: AbortSignal.timeout(2000) })
      if (!res.ok) return null
      return res.json() as Promise<SidecarHealth>
    } catch {
      return null
    }
  },

  samPredict: (req: SAMPredictRequest): Promise<SAMPredictResponse> =>
    post('/sam/predict', req),

  samPrepareSession: (req: SAMPrepareSessionRequest): Promise<{ status: string; runtime: SidecarRuntimeInfo }> =>
    post('/sam/session', req),

  yoloDetect: (req: YOLODetectRequest): Promise<YOLODetectResponse> =>
    post('/yolo/detect', req),
}
