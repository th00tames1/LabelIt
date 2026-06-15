// Typed fetch() wrappers for the Python AI sidecar (port 7842)

import type { SidecarHealth, SidecarRuntimeInfo } from '../types'

const BASE_URL = 'http://127.0.0.1:7842'

async function post<T>(path: string, body: unknown, timeoutMs = 300_000): Promise<T> {
  // Large SAM models on CPU can take 60–180s; 300s timeout for safety
  let res: Response
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch (err) {
    // Distinguish "sidecar process not running" (connection refused) from
    // "request took too long" (AbortSignal timeout) so the UI can react
    // differently (offer to start sidecar vs offer to retry / cancel).
    const message = err instanceof Error ? err.message : String(err)
    if (err instanceof Error && err.name === 'TimeoutError') {
      throw new Error(`AI sidecar timed out after ${Math.round(timeoutMs / 1000)}s. The model may be loading — retry in a moment.`)
    }
    if (/Failed to fetch|ECONNREFUSED|connection refused/i.test(message)) {
      throw new Error('AI sidecar is not running. Make sure Python is installed and try restarting LabelIt.')
    }
    throw new Error(`AI sidecar unreachable: ${message}`)
  }
  if (!res.ok) {
    // FastAPI returns {"detail": "..."} on HTTPException; surface that text
    // so the user sees the action-able message instead of raw HTTP code.
    let detail = `${res.status}`
    try {
      const body = await res.json() as { detail?: unknown }
      if (typeof body?.detail === 'string') detail = body.detail
      else detail = `${res.status} ${JSON.stringify(body)}`
    } catch {
      try { detail = `${res.status} ${await res.text()}` } catch { /* ignore */ }
    }
    throw new Error(detail)
  }
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

export interface SAMModelRequest {
  model_name: 'sam2.1' | 'sam3'
}

export interface SAMPredictResponse {
  candidates?: {
    contours: [number, number][][]
    score: number
    area: number
  }[]
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

  samSetModel: (req: SAMModelRequest): Promise<{ status: string; runtime: SidecarRuntimeInfo }> =>
    post('/sam/model', req),

  yoloDetect: (req: YOLODetectRequest): Promise<YOLODetectResponse> =>
    post('/yolo/detect', req),
}
