// Re-export all shared types for use in renderer
// These mirror the main process schema types

export type ImageStatus = 'unlabeled' | 'in_progress' | 'labeled' | 'approved'
export type SplitType = 'train' | 'val' | 'test' | 'unassigned'
export type AnnotationType = 'bbox' | 'polygon' | 'polyline' | 'keypoints' | 'mask'
export type AnnotationSource = 'manual' | 'sam' | 'yolo_auto'
export type ToolType = 'select' | 'bbox' | 'polygon' | 'keypoint' | 'sam' | 'null'
export type RightPanelTab = 'annotations' | 'labels' | 'stats'
export type AppLanguage = 'en' | 'ko'
export type AIDeviceMode = 'auto' | 'gpu' | 'cpu'
export type DatasetVersionKind = 'raw' | 'augmented'
export type DatasetAugmentationPreset = 'custom' | 'roboflow_basic' | 'yolo_balanced' | 'lighting' | 'geometry'
export type ExportFormat = 'yolo' | 'coco' | 'voc' | 'csv'
export type ResizeMode = 'black_edges' | 'white_edges' | 'stretch'
export type ContrastAdjustMode = 'stretch' | 'equalize'

export interface SidecarRuntimeInfo {
  device: string
  device_label: string
  acceleration: 'gpu' | 'cpu'
  cuda_available: boolean
  mps_available: boolean
  nvidia_gpu_detected: boolean
  hardware_label: string | null
  half_precision: boolean
  sam_model_name: string
  sam_model_label: string
  sam_model_loaded: boolean
  sam_text_model_loaded: boolean
  setup_hint: string | null
}

export interface SidecarHealth {
  status: string
  version: string
  runtime: SidecarRuntimeInfo
}

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
  is_null: boolean
  status: ImageStatus; split: SplitType
  imported_at: number; sort_order: number
  annotation_count: number   // computed: number of annotations on this image
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
  language: AppLanguage
  theme: 'dark' | 'light' | 'system'
  ai_device_mode: AIDeviceMode
  default_label_colors: string[]
  canvas_zoom_sensitivity: number
  auto_save_interval_ms: number
  sidecar_port: number
  shortcut_overrides: Record<string, string>
}

export interface AugmentationRecipe {
  tiling_enabled: boolean
  tiling_grid: number
  auto_orient_enabled: boolean
  isolate_objects_enabled: boolean
  resize_enabled: boolean
  resize_size: number
  resize_mode: ResizeMode
  grayscale_enabled: boolean
  adjust_contrast_enabled: boolean
  adjust_contrast_mode: ContrastAdjustMode
  horizontal_flip_enabled: boolean
  vertical_flip_enabled: boolean
  rotate_cw90_enabled: boolean
  rotate_cw270_enabled: boolean
  shear_enabled: boolean
  shear_range: number
  brightness_enabled: boolean
  brightness_range: number
  contrast_enabled: boolean
  contrast_range: number
  saturation_enabled: boolean
  saturation_range: number
  hue_enabled: boolean
  hue_range: number
  blur_enabled: boolean
  blur_range: number
}

export interface DatasetVersion {
  id: string
  name: string
  kind: DatasetVersionKind
  preset: DatasetAugmentationPreset
  multiplier: number
  apply_to: 'train'
  recipe: AugmentationRecipe | null
  created_at: number
  updated_at: number
}

export interface DatasetVersionInput {
  id?: string
  name: string
  preset: DatasetAugmentationPreset
  multiplier: number
  recipe: AugmentationRecipe
}

export interface FinishImageIssue {
  code: 'missing_annotations' | 'missing_labels' | 'unassigned_split' | 'status_unlabeled'
  label: string
}

export interface FinishImageItem {
  id: string
  filename: string
  status: ImageStatus
  split: SplitType
  annotation_count: number
  ready: boolean
  needs_review: boolean
  issues: FinishImageIssue[]
}

export interface FinishSplitSummary {
  split: SplitType
  total: number
  ready: number
}

export interface FinishSummary {
  total_images: number
  ready_images: number
  unlabeled_images: number
  in_progress_images: number
  labeled_images: number
  approved_images: number
  unassigned_split_images: number
  missing_label_images: number
  empty_annotation_images: number
  by_split: FinishSplitSummary[]
  images: FinishImageItem[]
}

export interface VersionExportRequest {
  version_ids: string[]
  format: ExportFormat
  output_dir: string
  include_images: boolean
  split?: SplitType
}

export interface VersionExportResult {
  version_id: string
  version_name: string
  output_path: string
  file_count: number
  annotation_count: number
}

export interface VersionExportBatchResult {
  results: VersionExportResult[]
}
