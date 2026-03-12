// Typed wrappers around window.api (exposed by preload)
import type {
  Annotation, AnnotationGeometry, AnnotationType, AnnotationSource,
  Image, ImageStatus, SplitType, LabelClass, KeypointDefinition, KeypointSkeletonEdge,
  ProjectMeta, RecentProject, AppSettings,
  AugmentationRecipe, DatasetVersion, DatasetVersionInput, FinishSummary,
  VersionExportBatchResult, VersionExportRequest,
} from '../types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const api = (window as any).api

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

export interface ImageFilter {
  status?: ImageStatus
  split?: SplitType
  label_class_id?: string
  search?: string
}

export interface SplitRatios {
  train: number; val: number; test: number
}

export interface ImportResult {
  imported: number; skipped: number; errors: string[]
}

// ─── Project ──────────────────────────────────────────────────────────────────
export const projectApi = {
  create: (name: string, directory: string): Promise<ProjectMeta> =>
    api.project.create(name, directory),
  open: (filePath: string): Promise<ProjectMeta> =>
    api.project.open(filePath),
  close: (): Promise<void> => api.project.close(),
  getMeta: (): Promise<ProjectMeta> => api.project.getMeta(),
  updateName: (name: string): Promise<ProjectMeta> => api.project.updateName(name),
  renameRecent: (filePath: string, name: string): Promise<RecentProject[]> =>
    api.project.renameRecent(filePath, name),
  listRecent: (): Promise<RecentProject[]> => api.project.listRecent(),
  showOpenDialog: (): Promise<string | null> => api.project.showOpenDialog(),
  showCreateDialog: (): Promise<string | null> => api.project.showCreateDialog(),
}

export const menuApi = {
  onAction: (callback: (action: string) => void): (() => void) => api.menu.onAction(callback),
}

// ─── Image ────────────────────────────────────────────────────────────────────
export const imageApi = {
  list: (filter?: ImageFilter): Promise<Image[]> => api.image.list(filter),
  get: (id: string): Promise<Image | null> => api.image.get(id),
  import: (filePaths: string[]): Promise<ImportResult> => api.image.import(filePaths),
  importFolder: (folderPath: string): Promise<ImportResult> => api.image.importFolder(folderPath),
  updateStatus: (id: string, status: ImageStatus): Promise<void> =>
    api.image.updateStatus(id, status),
  updateSplit: (id: string, split: SplitType): Promise<void> =>
    api.image.updateSplit(id, split),
  autoSplit: (ratios: SplitRatios): Promise<void> => api.image.autoSplit(ratios),
  showOpenDialog: (): Promise<string[] | null> => api.image.showOpenDialog(),
  showFolderDialog: (): Promise<string | null> => api.image.showFolderDialog(),
}

// ─── Annotation ───────────────────────────────────────────────────────────────
export const annotationApi = {
  listForImage: (imageId: string): Promise<Annotation[]> =>
    api.annotation.listForImage(imageId),
  create: (imageId: string, dto: CreateAnnotationDto): Promise<Annotation> =>
    api.annotation.create(imageId, dto),
  update: (id: string, dto: UpdateAnnotationDto): Promise<Annotation> =>
    api.annotation.update(id, dto),
  delete: (id: string): Promise<void> => api.annotation.delete(id),
  bulkCreate: (imageId: string, dtos: CreateAnnotationDto[]): Promise<Annotation[]> =>
    api.annotation.bulkCreate(imageId, dtos),
  bulkDelete: (ids: string[]): Promise<void> => api.annotation.bulkDelete(ids),
}

// ─── Label ────────────────────────────────────────────────────────────────────
export const labelApi = {
  list: (): Promise<LabelClass[]> => api.label.list(),
  create: (dto: { name: string; color: string; shortcut?: string | null }): Promise<LabelClass> =>
    api.label.create(dto),
  update: (id: string, dto: Partial<LabelClass>): Promise<LabelClass> =>
    api.label.update(id, dto),
  delete: (id: string): Promise<void> => api.label.delete(id),
  reorder: (ids: string[]): Promise<void> => api.label.reorder(ids),
  listKeypointDefs: (labelClassId: string): Promise<KeypointDefinition[]> =>
    api.label.listKeypointDefs(labelClassId),
  createKeypointDef: (
    labelClassId: string, name: string, color: string, sortOrder: number
  ): Promise<KeypointDefinition> =>
    api.label.createKeypointDef(labelClassId, name, color, sortOrder),
  deleteKeypointDef: (id: string): Promise<void> => api.label.deleteKeypointDef(id),
  setSkeletonEdge: (labelClassId: string, fromKpId: string, toKpId: string): Promise<void> =>
    api.label.setSkeletonEdge(labelClassId, fromKpId, toKpId),
  removeSkeletonEdge: (labelClassId: string, fromKpId: string, toKpId: string): Promise<void> =>
    api.label.removeSkeletonEdge(labelClassId, fromKpId, toKpId),
  listSkeletonEdges: (labelClassId: string): Promise<KeypointSkeletonEdge[]> =>
    api.label.listSkeletonEdges(labelClassId),
}

// ─── Settings ─────────────────────────────────────────────────────────────────
export const settingsApi = {
  get: (): Promise<AppSettings> => api.settings.get(),
  set: (partial: Partial<AppSettings>): Promise<AppSettings> => api.settings.set(partial),
  onChanged: (callback: (settings: AppSettings) => void): (() => void) =>
    api.settings.onChanged(callback),
}

// ─── Export ───────────────────────────────────────────────────────────────────
export interface ExportResult {
  output_path: string
  file_count: number
  annotation_count: number
}

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

export const exportApi = {
  toYOLO: (options: YOLOExportOptions): Promise<ExportResult> =>
    api.export.toYOLO(options),
  toCOCO: (options: COCOExportOptions): Promise<ExportResult> =>
    api.export.toCOCO(options),
  toVOC: (options: VOCExportOptions): Promise<ExportResult> =>
    api.export.toVOC(options),
  toCSV: (options: CSVExportOptions): Promise<ExportResult> =>
    api.export.toCSV(options),
  showSaveDialog: (): Promise<string | null> =>
    api.export.showSaveDialog(),
  showCSVSaveDialog: (): Promise<string | null> =>
    api.export.showCSVSaveDialog(),
}

// ─── Stats ────────────────────────────────────────────────────────────────────
export interface ClassAnnotationCount {
  label_class_id: string
  name: string
  color: string
  annotation_count: number
}

export interface DatasetStats {
  total_images: number
  labeled_images: number
  unlabeled_images: number
  total_annotations: number
  by_class: ClassAnnotationCount[]
  by_split: { split: string; count: number }[]
  by_status: { status: string; count: number }[]
}

export const statsApi = {
  get: (): Promise<DatasetStats> => api.stats.get(),
}

// ─── Sidecar ─────────────────────────────────────────────────────────────────
export const sidecarApi = {
  getStatus: (): Promise<string> => api.sidecar.getStatus(),
}

// ─── YOLO Auto-Label ─────────────────────────────────────────────────────────
export interface AutoLabelRequest {
  imageIds: string[]
  modelPath: string
  confidenceThreshold: number
  iouThreshold: number
}

export interface ImageAutoLabelResult {
  imageId: string
  detectionCount: number
  newLabelClasses: string[]
  error?: string
}

export interface AutoLabelResponse {
  results: ImageAutoLabelResult[]
  totalDetections: number
  processingTimeMs: number
}

export const yoloApi = {
  autoLabel: (req: AutoLabelRequest): Promise<AutoLabelResponse> =>
    api.yolo.autoLabel(req),
  acceptAll: (imageId: string): Promise<number> =>
    api.yolo.acceptAll(imageId),
  acceptOne: (annotationId: string): Promise<void> =>
    api.yolo.acceptOne(annotationId),
  rejectAll: (imageId: string): Promise<number> =>
    api.yolo.rejectAll(imageId),
  rejectOne: (annotationId: string): Promise<void> =>
    api.yolo.rejectOne(annotationId),
}

// ─── Finish Workspace ─────────────────────────────────────────────────────────
export const finishApi = {
  getSummary: (): Promise<FinishSummary> => api.finish.getSummary(),
  listVersions: (): Promise<DatasetVersion[]> => api.finish.listVersions(),
  getDefaultRecipe: (): Promise<AugmentationRecipe> => api.finish.getDefaultRecipe(),
  saveVersion: (input: DatasetVersionInput): Promise<DatasetVersion> => api.finish.saveVersion(input),
  deleteVersion: (id: string): Promise<void> => api.finish.deleteVersion(id),
  exportVersions: (request: VersionExportRequest): Promise<VersionExportBatchResult> =>
    api.finish.exportVersions(request),
}
