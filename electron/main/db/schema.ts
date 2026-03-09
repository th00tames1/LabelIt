// Central TypeScript type definitions — all other modules depend on these

export type ImageStatus = 'unlabeled' | 'in_progress' | 'labeled' | 'approved'
export type SplitType = 'train' | 'val' | 'test' | 'unassigned'
export type AnnotationType = 'bbox' | 'polygon' | 'polyline' | 'keypoints' | 'mask'
export type AnnotationSource = 'manual' | 'sam' | 'yolo_auto'
export type AppLanguage = 'en' | 'ko'

// ─── Geometry types (all coordinates normalized 0.0–1.0) ───────────────────

export interface BBoxGeometry {
  type: 'bbox'
  x: number       // top-left x
  y: number       // top-left y
  width: number
  height: number
}

export interface PolygonGeometry {
  type: 'polygon' | 'polyline'
  points: [number, number][]
}

export interface KeypointEntry {
  kp_def_id: string
  x: number
  y: number
  visibility: 0 | 1 | 2  // 0=unlabeled, 1=not visible, 2=visible (COCO)
}

export interface KeypointsGeometry {
  type: 'keypoints'
  keypoints: KeypointEntry[]
}

export interface MaskGeometry {
  type: 'mask'
  contours: [number, number][][]   // Multiple polygon contours (for holes)
  mask_width: number
  mask_height: number
}

export type AnnotationGeometry =
  | BBoxGeometry
  | PolygonGeometry
  | KeypointsGeometry
  | MaskGeometry

// ─── Database row types ─────────────────────────────────────────────────────

export interface ProjectMeta {
  version: string
  name: string
  created_at: number
  image_storage_mode: 'linked' | 'copied'
}

export interface LabelClass {
  id: string
  name: string
  color: string           // '#FF6B6B'
  shortcut: string | null // '1'–'9'
  sort_order: number
  created_at: number
}

export interface Image {
  id: string
  filename: string
  file_path: string
  thumbnail_path: string | null
  width: number
  height: number
  file_size: number
  status: ImageStatus
  split: SplitType
  imported_at: number
  sort_order: number
  annotation_count: number   // computed via subquery in listImages
}

export interface Annotation {
  id: string
  image_id: string
  label_class_id: string | null
  annotation_type: AnnotationType
  geometry: AnnotationGeometry   // parsed from JSON column
  confidence: number | null
  source: AnnotationSource
  created_at: number
  updated_at: number
}

export interface KeypointDefinition {
  id: string
  label_class_id: string
  name: string
  sort_order: number
  color: string
}

export interface KeypointSkeletonEdge {
  label_class_id: string
  from_kp_id: string
  to_kp_id: string
}

// ─── DTO types for IPC ──────────────────────────────────────────────────────

export interface CreateAnnotationDto {
  label_class_id?: string | null
  annotation_type: AnnotationType
  geometry: AnnotationGeometry
  confidence?: number | null
  source?: AnnotationSource
}

export interface UpdateAnnotationDto {
  label_class_id?: string | null
  geometry?: AnnotationGeometry
  confidence?: number | null
}

export interface CreateLabelDto {
  name: string
  color: string
  shortcut?: string | null
}

export interface UpdateLabelDto {
  name?: string
  color?: string
  shortcut?: string | null
  sort_order?: number
}

export interface ImageFilter {
  status?: ImageStatus
  split?: SplitType
  label_class_id?: string
  search?: string
}

export interface SplitRatios {
  train: number   // 0–1
  val: number
  test: number
}

export interface ImportResult {
  imported: number
  skipped: number
  errors: string[]
}

export interface ExportResult {
  output_path: string
  file_count: number
  annotation_count: number
}

// ─── Export option types ────────────────────────────────────────────────────

export interface YOLOExportOptions {
  output_dir: string
  include_images: boolean
  split?: SplitType
}

export interface COCOExportOptions {
  output_dir: string
  split?: SplitType
}

export interface VOCExportOptions {
  output_dir: string
  include_images: boolean
  split?: SplitType
}

export interface CSVExportOptions {
  output_path: string
  split?: SplitType
}

// ─── App settings ───────────────────────────────────────────────────────────

export interface AppSettings {
  language: AppLanguage
  theme: 'dark' | 'light' | 'system'
  default_label_colors: string[]
  canvas_zoom_sensitivity: number
  auto_save_interval_ms: number
  sidecar_port: number
  shortcut_overrides: Record<string, string>
}

export const DEFAULT_SETTINGS: AppSettings = {
  language: 'en',
  theme: 'dark',
  default_label_colors: [
    '#EF4444', '#F97316', '#EAB308', '#22C55E',
    '#3B82F6', '#8B5CF6', '#EC4899', '#14B8A6',
    '#F43F5E', '#84CC16',
  ],
  canvas_zoom_sensitivity: 1.0,
  auto_save_interval_ms: 0,   // 0 = always immediate
  sidecar_port: 7842,
  shortcut_overrides: {},
}

// ─── Recent project list ────────────────────────────────────────────────────

export interface RecentProject {
  name: string
  file_path: string
  last_opened: number
  image_count: number
}
