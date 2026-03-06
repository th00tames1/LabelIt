// Re-export all shared types for use in renderer
// These mirror the main process schema types

export type ImageStatus = 'unlabeled' | 'in_progress' | 'labeled' | 'approved'
export type SplitType = 'train' | 'val' | 'test' | 'unassigned'
export type AnnotationType = 'bbox' | 'polygon' | 'polyline' | 'keypoints' | 'mask'
export type AnnotationSource = 'manual' | 'sam' | 'yolo_auto'
export type ToolType = 'select' | 'bbox' | 'polygon' | 'keypoint' | 'sam'

export interface BBoxGeometry {
  type: 'bbox'
  x: number; y: number; width: number; height: number
}

export interface PolygonGeometry {
  type: 'polygon' | 'polyline'
  points: [number, number][]
}

export interface KeypointEntry {
  kp_def_id: string; x: number; y: number; visibility: 0 | 1 | 2
}

export interface KeypointsGeometry {
  type: 'keypoints'
  keypoints: KeypointEntry[]
}

export interface MaskGeometry {
  type: 'mask'
  contours: [number, number][][]
  mask_width: number; mask_height: number
}

export type AnnotationGeometry = BBoxGeometry | PolygonGeometry | KeypointsGeometry | MaskGeometry

export interface LabelClass {
  id: string; name: string; color: string; shortcut: string | null
  sort_order: number; created_at: number
}

export interface Image {
  id: string; filename: string; file_path: string; thumbnail_path: string | null
  width: number; height: number; file_size: number
  status: ImageStatus; split: SplitType
  imported_at: number; sort_order: number
}

export interface Annotation {
  id: string; image_id: string; label_class_id: string | null
  annotation_type: AnnotationType; geometry: AnnotationGeometry
  confidence: number | null; source: AnnotationSource
  created_at: number; updated_at: number
}

export interface KeypointDefinition {
  id: string; label_class_id: string; name: string; sort_order: number; color: string
}

export interface KeypointSkeletonEdge {
  label_class_id: string; from_kp_id: string; to_kp_id: string
}

export interface ProjectMeta {
  version: string; name: string; created_at: number
  image_storage_mode: 'linked' | 'copied'
}

export interface RecentProject {
  name: string; file_path: string; last_opened: number; image_count: number
}

export interface NormalizedPoint {
  x: number  // 0–1
  y: number  // 0–1
}

export interface AppSettings {
  theme: 'dark' | 'light' | 'system'
  default_label_colors: string[]
  canvas_zoom_sensitivity: number
  auto_save_interval_ms: number
  sidecar_port: number
  shortcut_overrides: Record<string, string>
}

