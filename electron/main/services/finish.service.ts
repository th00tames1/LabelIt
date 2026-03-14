import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'fs'
import { basename, extname, join } from 'path'
import sharp from 'sharp'
import { create as createXml } from 'xmlbuilder2'
import { v4 as uuidv4 } from 'uuid'
import { listForImage } from '../db/repositories/annotation.repo'
import { listImages } from '../db/repositories/image.repo'
import { listLabels } from '../db/repositories/label.repo'
import { getDatasetVersions, setDatasetVersions } from '../db/repositories/project.repo'
import type {
  Annotation,
  AnnotationGeometry,
  AugmentationRecipe,
  ContrastAdjustMode,
  DatasetVersion,
  DatasetVersionInput,
  ExportResult,
  FinishImageIssue,
  FinishImageItem,
  FinishSplitSummary,
  FinishSummary,
  Image,
  LabelClass,
  ResizeMode,
  SplitType,
  VersionExportBatchResult,
  VersionExportRequest,
  VersionExportResult,
} from '../db/schema'

export const RAW_DATASET_VERSION_ID = 'raw'

interface MaterializedTransform {
  resizeEnabled: boolean
  resizeSize: number
  resizeMode: ResizeMode
  grayscaleEnabled: boolean
  adjustContrastMode: ContrastAdjustMode | null
  horizontalFlip: boolean
  verticalFlip: boolean
  rotation: 0 | 90 | 270
  freeRotation: number
  shearX: number
  shearY: number
  brightnessDelta: number
  contrastDelta: number
  saturationDelta: number
  hueDelta: number
  blurSigma: number
  autoOrientEnabled: boolean
}

interface ResolvedSample {
  id: string
  filename: string
  file_path: string
  width: number
  height: number
  split: SplitType
  annotations: Annotation[]
  tile?: TileRegion
  transform: MaterializedTransform | null
}

interface TileRegion {
  left: number
  top: number
  width: number
  height: number
  row: number
  col: number
  grid: number
}

interface SampleSeed extends Omit<ResolvedSample, 'transform'> {}

const DEFAULT_RECIPE: AugmentationRecipe = {
  tiling_enabled: false,
  tiling_grid: 2,
  auto_orient_enabled: false,
  isolate_objects_enabled: false,
  resize_enabled: false,
  resize_size: 640,
  resize_mode: 'black_edges',
  grayscale_enabled: false,
  adjust_contrast_enabled: false,
  adjust_contrast_mode: 'stretch',
  horizontal_flip_enabled: false,
  vertical_flip_enabled: false,
  rotate_cw90_enabled: false,
  rotate_cw270_enabled: false,
  rotate_enabled: true,
  rotate_range: 15,
  shear_enabled: false,
  shear_x_range: 0,
  shear_y_range: 0,
  brightness_enabled: false,
  brightness_range: 0,
  contrast_enabled: false,
  contrast_range: 0,
  saturation_enabled: false,
  saturation_range: 0,
  hue_enabled: false,
  hue_range: 0,
  blur_enabled: false,
  blur_range: 0,
}

const SPLIT_ORDER: SplitType[] = ['train', 'val', 'test', 'unassigned']

export function listFinishVersions(): DatasetVersion[] {
  const stored = getDatasetVersions()
    .filter((version) => version.kind === 'augmented')
    .sort((a, b) => b.updated_at - a.updated_at)

  return [getRawVersion(), ...stored]
}

export function upsertFinishVersion(input: DatasetVersionInput): DatasetVersion {
  const name = input.name.trim()
  if (!name) throw new Error('Version name cannot be empty.')
  if (input.id === RAW_DATASET_VERSION_ID) throw new Error('The raw dataset version cannot be edited.')

  const recipe = normalizeRecipe(input.recipe)
  if (!hasAnyRecipeEffect(recipe)) {
    throw new Error('Enable at least one augmentation before saving a version.')
  }

  const multiplier = clampInt(input.multiplier, 2, 8)
  const versions = getDatasetVersions().filter((version) => version.kind === 'augmented')
  const existingIndex = input.id != null ? versions.findIndex((version) => version.id === input.id) : -1
  const now = Date.now()

  const nextVersion: DatasetVersion = existingIndex >= 0
    ? {
        ...versions[existingIndex],
        name,
        preset: input.preset,
        multiplier,
        recipe,
        updated_at: now,
      }
    : {
        id: uuidv4(),
        name,
        kind: 'augmented',
        preset: input.preset,
        multiplier,
        apply_to: 'train',
        recipe,
        created_at: now,
        updated_at: now,
      }

  if (existingIndex >= 0) versions[existingIndex] = nextVersion
  else versions.unshift(nextVersion)

  setDatasetVersions(versions)
  return nextVersion
}

export function deleteFinishVersion(id: string): void {
  if (id === RAW_DATASET_VERSION_ID) throw new Error('The raw dataset version cannot be deleted.')

  const nextVersions = getDatasetVersions().filter((version) => version.id !== id)
  setDatasetVersions(nextVersions)
}

export function getFinishSummary(): FinishSummary {
  const images = listImages()
  const items = images.map(toFinishImageItem)

  const bySplit: FinishSplitSummary[] = SPLIT_ORDER.map((split) => {
    const splitItems = items.filter((item) => item.split === split)
    return {
      split,
      total: splitItems.length,
      ready: splitItems.filter((item) => item.ready).length,
    }
  })

  return {
    total_images: items.length,
    ready_images: items.filter((item) => item.ready).length,
    unlabeled_images: items.filter((item) => item.status === 'unlabeled').length,
    in_progress_images: items.filter((item) => item.status === 'in_progress').length,
    labeled_images: items.filter((item) => item.status === 'labeled').length,
    approved_images: items.filter((item) => item.status === 'approved').length,
    unassigned_split_images: items.filter((item) => item.split === 'unassigned').length,
    missing_label_images: items.filter((item) => hasIssue(item.issues, 'missing_labels')).length,
    empty_annotation_images: items.filter((item) => hasIssue(item.issues, 'missing_annotations')).length,
    by_split: bySplit,
    images: items,
  }
}

export async function exportFinishVersions(request: VersionExportRequest): Promise<VersionExportBatchResult> {
  if (request.version_ids.length === 0) throw new Error('Select at least one dataset version to export.')
  const versions = listFinishVersions()
  if (!request.include_images && request.version_ids.some((id) => versions.find((version) => version.id === id)?.kind === 'augmented')) {
    throw new Error('Augmented versions require image export so the generated files can be materialized.')
  }

  assertExportReadiness(request.split)
  mkdirSync(request.output_dir, { recursive: true })

  const labels = listLabels()
  const results: VersionExportResult[] = []

  for (const versionId of request.version_ids) {
    const version = versions.find((entry) => entry.id === versionId)
    if (!version) throw new Error(`Dataset version not found: ${versionId}`)

    const samples = buildResolvedSamples(version, request.split)
    assertFormatCompatibility(request.format, samples)
    let exported: ExportResult
    if (request.format === 'yolo') {
      exported = await exportSamplesToYOLO(request.output_dir, version, labels, samples, request.include_images)
    } else if (request.format === 'coco') {
      exported = await exportSamplesToCOCO(request.output_dir, version, labels, samples, request.include_images)
    } else if (request.format === 'voc') {
      exported = await exportSamplesToVOC(request.output_dir, version, labels, samples, request.include_images)
    } else {
      exported = await exportSamplesToCSV(request.output_dir, version, labels, samples, request.include_images)
    }

    results.push({
      ...exported,
      version_id: version.id,
      version_name: version.name,
    })
  }

  return { results }
}

function getRawVersion(): DatasetVersion {
  return {
    id: RAW_DATASET_VERSION_ID,
    name: 'Raw Dataset',
    kind: 'raw',
    preset: 'custom',
    multiplier: 1,
    apply_to: 'train',
    recipe: null,
    created_at: 0,
    updated_at: 0,
  }
}

function toFinishImageItem(image: Image): FinishImageItem {
  const annotations = listForImage(image.id)
  const issues: FinishImageIssue[] = []

  if (annotations.length === 0 && !image.is_null) {
    issues.push({ code: 'missing_annotations', label: 'No annotations yet' })
  }
  if (annotations.length > 0 && image.status === 'unlabeled' && !image.is_null) {
    issues.push({ code: 'status_unlabeled', label: 'Image status is still unlabeled' })
  }
  if (annotations.some((annotation) => annotation.label_class_id == null)) {
    issues.push({ code: 'missing_labels', label: 'Some annotations still need a class' })
  }
  if (image.split === 'unassigned') {
    issues.push({ code: 'unassigned_split', label: 'Dataset split is not assigned' })
  }

  return {
    id: image.id,
    filename: image.filename,
    status: image.status,
    split: image.split,
    annotation_count: image.annotation_count,
    ready: issues.length === 0,
    needs_review: false,
    issues,
  }
}

function hasIssue(issues: FinishImageIssue[], code: FinishImageIssue['code']): boolean {
  return issues.some((issue) => issue.code === code)
}

function normalizeRecipe(recipe: AugmentationRecipe): AugmentationRecipe {
  const candidate = { ...DEFAULT_RECIPE, ...(recipe as Partial<AugmentationRecipe>) }

  return {
    tiling_enabled: Boolean(candidate.tiling_enabled),
    tiling_grid: clampInt(candidate.tiling_grid, 2, 8),
    auto_orient_enabled: Boolean(candidate.auto_orient_enabled),
    isolate_objects_enabled: Boolean(candidate.isolate_objects_enabled),
    resize_enabled: Boolean(candidate.resize_enabled),
    resize_size: clampInt(candidate.resize_size, 128, 4096),
    resize_mode: normalizeResizeMode(candidate.resize_mode),
    grayscale_enabled: Boolean(candidate.grayscale_enabled),
    adjust_contrast_enabled: Boolean(candidate.adjust_contrast_enabled),
    adjust_contrast_mode: normalizeContrastAdjustMode(candidate.adjust_contrast_mode),
    horizontal_flip_enabled: Boolean(candidate.horizontal_flip_enabled),
    vertical_flip_enabled: Boolean(candidate.vertical_flip_enabled),
    rotate_cw90_enabled: Boolean(candidate.rotate_cw90_enabled),
    rotate_cw270_enabled: Boolean(candidate.rotate_cw270_enabled),
    rotate_enabled: Boolean(candidate.rotate_enabled),
    rotate_range: clampNumber(Math.abs(candidate.rotate_range), 0, 15),
    shear_enabled: Boolean(candidate.shear_enabled),
    shear_x_range: clampNumber(Math.abs(candidate.shear_x_range), 0, 15),
    shear_y_range: clampNumber(Math.abs(candidate.shear_y_range), 0, 15),
    brightness_enabled: Boolean(candidate.brightness_enabled),
    brightness_range: clampNumber(Math.abs(candidate.brightness_range), 0, 0.3),
    contrast_enabled: Boolean(candidate.contrast_enabled),
    contrast_range: clampNumber(Math.abs(candidate.contrast_range), 0, 0.3),
    saturation_enabled: Boolean(candidate.saturation_enabled),
    saturation_range: clampNumber(Math.abs(candidate.saturation_range), 0, 0.3),
    hue_enabled: Boolean(candidate.hue_enabled),
    hue_range: clampNumber(Math.abs(candidate.hue_range), 0, 30),
    blur_enabled: Boolean(candidate.blur_enabled),
    blur_range: clampNumber(Math.abs(candidate.blur_range), 0, 3),
  }
}

function hasAnyRecipeEffect(recipe: AugmentationRecipe): boolean {
  return hasPreprocessingEffect(recipe) || hasAugmentationEffect(recipe)
}

function buildResolvedSamples(version: DatasetVersion, split?: SplitType): ResolvedSample[] {
  const images = listImages(split ? { split } : undefined)

  return images.flatMap((image) => {
    const annotations = listForImage(image.id)
    if (version.kind !== 'augmented' || version.recipe == null) {
      return [createResolvedSample({
        id: image.id,
        filename: image.filename,
        file_path: image.file_path,
        width: image.width,
        height: image.height,
        split: image.split,
        annotations,
      }, null)]
    }

    const recipe = version.recipe
    const seeds = buildSampleSeeds(image, annotations, recipe)
    const samples: ResolvedSample[] = seeds.map((seed: SampleSeed) => {
      const baseTransform = createMaterializedTransform(recipe, mulberry32(hashString(`${version.id}:${seed.id}:base`)), false)
      return createResolvedSample(seed, baseTransform)
    })

    if (image.split !== 'train' || !hasAugmentationEffect(recipe)) {
      return samples
    }

    seeds.forEach((seed: SampleSeed) => {
      for (let copyIndex = 1; copyIndex < version.multiplier; copyIndex += 1) {
        const rng = mulberry32(hashString(`${version.id}:${seed.id}:${copyIndex}`))
        const transform = createMaterializedTransform(recipe, rng, true)
        samples.push(createResolvedSample(
          {
            ...seed,
            id: `${seed.id}__${version.id}__${copyIndex}`,
            filename: buildAugmentedFilename(seed.filename, version.name, copyIndex),
          },
          transform,
        ))
      }
    })

    return samples
  })
}

function createMaterializedTransform(recipe: AugmentationRecipe, rng: () => number, includeAugmentation: boolean): MaterializedTransform | null {
  const absRotate = Math.abs(recipe.rotate_range)
  const absShearX = Math.abs(recipe.shear_x_range)
  const absShearY = Math.abs(recipe.shear_y_range)
  const absBrightness = Math.abs(recipe.brightness_range)
  const absContrast = Math.abs(recipe.contrast_range)
  const absSaturation = Math.abs(recipe.saturation_range)
  const absHue = Math.abs(recipe.hue_range)
  const absBlur = Math.abs(recipe.blur_range)
  const rotationChoices: Array<0 | 90 | 270> = []
  if (includeAugmentation && recipe.rotate_cw90_enabled) rotationChoices.push(90)
  if (includeAugmentation && recipe.rotate_cw270_enabled) rotationChoices.push(270)

  const transform: MaterializedTransform = {
    resizeEnabled: recipe.resize_enabled,
    resizeSize: recipe.resize_size,
    resizeMode: recipe.resize_mode,
    grayscaleEnabled: recipe.grayscale_enabled,
    adjustContrastMode: recipe.adjust_contrast_enabled ? recipe.adjust_contrast_mode : null,
    autoOrientEnabled: recipe.auto_orient_enabled,
    horizontalFlip: includeAugmentation && recipe.horizontal_flip_enabled && rng() < 0.5,
    verticalFlip: includeAugmentation && recipe.vertical_flip_enabled && rng() < 0.5,
    rotation: rotationChoices.length > 0 ? pick(rotationChoices, rng) : 0,
    freeRotation: includeAugmentation && recipe.rotate_enabled && absRotate > 0 ? randomRange(rng, -absRotate, absRotate) : 0,
    shearX: includeAugmentation && recipe.shear_enabled && absShearX > 0 ? randomRange(rng, -absShearX, absShearX) : 0,
    shearY: includeAugmentation && recipe.shear_enabled && absShearY > 0 ? randomRange(rng, -absShearY, absShearY) : 0,
    brightnessDelta: includeAugmentation && recipe.brightness_enabled && absBrightness > 0 ? randomRange(rng, -absBrightness, absBrightness) : 0,
    contrastDelta: includeAugmentation && recipe.contrast_enabled && absContrast > 0 ? randomRange(rng, -absContrast, absContrast) : 0,
    saturationDelta: includeAugmentation && recipe.saturation_enabled && absSaturation > 0 ? randomRange(rng, -absSaturation, absSaturation) : 0,
    hueDelta: includeAugmentation && recipe.hue_enabled && absHue > 0 ? randomRange(rng, -absHue, absHue) : 0,
    blurSigma: includeAugmentation && recipe.blur_enabled && absBlur > 0 ? randomRange(rng, 0, absBlur) : 0,
  }

  if (isIdentityTransform(transform)) {
    if (!includeAugmentation) return null
    if (recipe.horizontal_flip_enabled) transform.horizontalFlip = true
    else if (recipe.rotate_cw90_enabled) transform.rotation = 90
    else if (recipe.rotate_cw270_enabled) transform.rotation = 270
    else if (recipe.vertical_flip_enabled) transform.verticalFlip = true
    else if (recipe.rotate_enabled && absRotate > 0) transform.freeRotation = Math.max(4, absRotate * 0.5)
    else if (recipe.shear_enabled && (absShearX > 0 || absShearY > 0)) {
      transform.shearX = Math.max(4, absShearX * 0.5)
      transform.shearY = Math.max(4, absShearY * 0.5)
    }
    else if (recipe.brightness_enabled && absBrightness > 0) transform.brightnessDelta = Math.max(0.08, absBrightness * 0.5)
    else if (recipe.contrast_enabled && absContrast > 0) transform.contrastDelta = Math.max(0.08, absContrast * 0.5)
    else if (recipe.saturation_enabled && absSaturation > 0) transform.saturationDelta = Math.max(0.1, absSaturation * 0.5)
    else if (recipe.hue_enabled && absHue > 0) transform.hueDelta = Math.max(4, absHue * 0.5)
    else if (recipe.blur_enabled && absBlur > 0) transform.blurSigma = Math.max(0.3, absBlur * 0.5)
  }

  return isIdentityTransform(transform) ? null : transform
}

function assertExportReadiness(split?: SplitType): void {
  const summary = getFinishSummary()
  const items = split != null
    ? summary.images.filter((image) => image.split === split)
    : summary.images

  const missingAnnotations = items.filter((image) => hasIssue(image.issues, 'missing_annotations')).length
  const statusUnlabeled = items.filter((image) => hasIssue(image.issues, 'status_unlabeled')).length
  const missingLabels = items.filter((image) => hasIssue(image.issues, 'missing_labels')).length
  const unassigned = items.filter((image) => hasIssue(image.issues, 'unassigned_split')).length

  const blockers: string[] = []
  if (missingAnnotations > 0) blockers.push(`${missingAnnotations} image(s) without annotations`)
  if (statusUnlabeled > 0) blockers.push(`${statusUnlabeled} image(s) still marked as unlabeled`)
  if (missingLabels > 0) blockers.push(`${missingLabels} image(s) with missing class labels`)
  if (unassigned > 0) blockers.push(`${unassigned} image(s) with no dataset split`)

  if (blockers.length > 0) {
    throw new Error(`Resolve Finish blockers before exporting: ${blockers.join(', ')}.`)
  }
}

function isIdentityTransform(transform: MaterializedTransform): boolean {
  return !transform.resizeEnabled
    && !transform.grayscaleEnabled
    && transform.adjustContrastMode == null
    && !transform.horizontalFlip
    && !transform.verticalFlip
    && transform.rotation === 0
    && Math.abs(transform.freeRotation) < 0.25
    && Math.abs(transform.shearX) < 0.5
    && Math.abs(transform.shearY) < 0.5
    && Math.abs(transform.brightnessDelta) < 0.01
    && Math.abs(transform.contrastDelta) < 0.01
    && Math.abs(transform.saturationDelta) < 0.01
    && Math.abs(transform.hueDelta) < 0.5
    && transform.blurSigma < 0.1
    && !transform.autoOrientEnabled
}

function buildSampleSeeds(image: Image, annotations: Annotation[], recipe: AugmentationRecipe): SampleSeed[] {
  if (!recipe.tiling_enabled) {
    return [{
      id: image.id,
      filename: image.filename,
      file_path: image.file_path,
      width: image.width,
      height: image.height,
      split: image.split,
      annotations,
    }]
  }

  const seeds: SampleSeed[] = []
  const grid = recipe.tiling_grid
  for (let row = 0; row < grid; row += 1) {
    const top = Math.round((row * image.height) / grid)
    const bottom = Math.round(((row + 1) * image.height) / grid)
    for (let col = 0; col < grid; col += 1) {
      const left = Math.round((col * image.width) / grid)
      const right = Math.round(((col + 1) * image.width) / grid)
      const tile: TileRegion = {
        left,
        top,
        width: right - left,
        height: bottom - top,
        row,
        col,
        grid,
      }

      seeds.push({
        id: `${image.id}__tile_${row + 1}_${col + 1}`,
        filename: buildTiledFilename(image.filename, row + 1, col + 1),
        file_path: image.file_path,
        width: tile.width,
        height: tile.height,
        split: image.split,
        annotations: annotations
          .map((annotation) => clipAnnotationToTile(annotation, tile, image.width, image.height))
          .filter((annotation): annotation is Annotation => annotation != null),
        tile,
      })
    }
  }

  return seeds
}

function createResolvedSample(
  seed: SampleSeed,
  transform: MaterializedTransform | null,
): ResolvedSample {
  const [width, height] = transform == null
    ? [seed.width, seed.height]
    : computeOutputDimensions(seed.width, seed.height, transform)

  return {
    id: seed.id,
    filename: seed.filename,
    file_path: seed.file_path,
    width,
    height,
    split: seed.split,
    annotations: transform == null
      ? seed.annotations
      : seed.annotations.map((annotation) => transformAnnotation(annotation, transform, seed.width, seed.height)),
    tile: seed.tile,
    transform,
  }
}

function clipAnnotationToTile(
  annotation: Annotation,
  tile: TileRegion,
  imageWidth: number,
  imageHeight: number,
): Annotation | null {
  const x0 = tile.left / imageWidth
  const y0 = tile.top / imageHeight
  const x1 = (tile.left + tile.width) / imageWidth
  const y1 = (tile.top + tile.height) / imageHeight
  const normX = (value: number) => clamp01((value - x0) / Math.max(x1 - x0, Number.EPSILON))
  const normY = (value: number) => clamp01((value - y0) / Math.max(y1 - y0, Number.EPSILON))

  if (annotation.geometry.type === 'bbox') {
    const left = Math.max(annotation.geometry.x, x0)
    const top = Math.max(annotation.geometry.y, y0)
    const right = Math.min(annotation.geometry.x + annotation.geometry.width, x1)
    const bottom = Math.min(annotation.geometry.y + annotation.geometry.height, y1)
    if (right <= left || bottom <= top) return null
    return {
      ...annotation,
      geometry: {
        type: 'bbox',
        x: normX(left),
        y: normY(top),
        width: clamp01(normX(right) - normX(left)),
        height: clamp01(normY(bottom) - normY(top)),
      },
    }
  }

  if (annotation.geometry.type === 'polygon' || annotation.geometry.type === 'polyline') {
    const bounds = getPointBounds(annotation.geometry.points)
    if (bounds.maxX < x0 || bounds.minX > x1 || bounds.maxY < y0 || bounds.minY > y1) return null
    const nextPoints = annotation.geometry.points.map(([x, y]) => [normX(clampNumber(x, x0, x1)), normY(clampNumber(y, y0, y1))] as [number, number])
    if (annotation.geometry.type === 'polygon' && nextPoints.length < 3) return null
    if (annotation.geometry.type === 'polyline' && nextPoints.length < 2) return null
    return {
      ...annotation,
      geometry: {
        ...annotation.geometry,
        points: nextPoints,
      },
    }
  }

  if (annotation.geometry.type === 'keypoints') {
    const keypoints = annotation.geometry.keypoints
      .filter((keypoint) => keypoint.x >= x0 && keypoint.x <= x1 && keypoint.y >= y0 && keypoint.y <= y1)
      .map((keypoint) => ({ ...keypoint, x: normX(keypoint.x), y: normY(keypoint.y) }))
    if (keypoints.length === 0) return null
    return {
      ...annotation,
      geometry: {
        ...annotation.geometry,
        keypoints,
      },
    }
  }

  if (annotation.geometry.type === 'mask') {
    const contours = annotation.geometry.contours
      .map((contour) => contour.map(([x, y]) => [normX(clampNumber(x, x0, x1)), normY(clampNumber(y, y0, y1))] as [number, number]))
      .filter((contour) => contour.length >= 3)
    if (contours.length === 0) return null
    return {
      ...annotation,
      geometry: {
        ...annotation.geometry,
        contours,
        mask_width: tile.width,
        mask_height: tile.height,
      },
    }
  }

  return annotation
}

function getPointBounds(points: [number, number][]): { minX: number; minY: number; maxX: number; maxY: number } {
  const xs = points.map(([x]) => x)
  const ys = points.map(([, y]) => y)
  return {
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    maxX: Math.max(...xs),
    maxY: Math.max(...ys),
  }
}

function transformAnnotation(
  annotation: Annotation,
  transform: MaterializedTransform,
  sourceWidth: number,
  sourceHeight: number,
): Annotation {
  return {
    ...annotation,
    geometry: transformGeometry(annotation.geometry, transform, sourceWidth, sourceHeight),
  }
}

function transformGeometry(
  geometry: AnnotationGeometry,
  transform: MaterializedTransform,
  sourceWidth: number,
  sourceHeight: number,
): AnnotationGeometry {
  if (geometry.type === 'bbox') {
    const bboxCorners: [number, number][] = [
      [geometry.x, geometry.y],
      [geometry.x + geometry.width, geometry.y],
      [geometry.x, geometry.y + geometry.height],
      [geometry.x + geometry.width, geometry.y + geometry.height],
    ]
    const corners = bboxCorners.map((point) => transformPoint(point, transform, sourceWidth, sourceHeight))

    const xs = corners.map(([x]) => x)
    const ys = corners.map(([, y]) => y)
    const minX = clamp01(Math.min(...xs))
    const maxX = clamp01(Math.max(...xs))
    const minY = clamp01(Math.min(...ys))
    const maxY = clamp01(Math.max(...ys))

    return {
      type: 'bbox',
      x: minX,
      y: minY,
      width: clamp01(maxX - minX),
      height: clamp01(maxY - minY),
    }
  }

  if (geometry.type === 'polygon' || geometry.type === 'polyline') {
    return {
      ...geometry,
      points: geometry.points.map((point) => transformPoint(point, transform, sourceWidth, sourceHeight)),
    }
  }

  if (geometry.type === 'keypoints') {
    return {
      ...geometry,
      keypoints: geometry.keypoints.map((keypoint) => {
        const [x, y] = transformPoint([keypoint.x, keypoint.y], transform, sourceWidth, sourceHeight)
        return { ...keypoint, x, y }
      }),
    }
  }

  if (geometry.type === 'mask') {
    return {
      ...geometry,
      contours: geometry.contours.map((contour: [number, number][]) =>
        contour.map((point: [number, number]) => transformPoint(point, transform, sourceWidth, sourceHeight))
      ),
      mask_width: computeOutputDimensions(geometry.mask_width, geometry.mask_height, transform)[0],
      mask_height: computeOutputDimensions(geometry.mask_width, geometry.mask_height, transform)[1],
    }
  }

  return geometry
}

function transformPoint(
  point: [number, number],
  transform: MaterializedTransform,
  sourceWidth: number,
  sourceHeight: number,
): [number, number] {
  let [x, y] = point
  let currentWidth = sourceWidth
  let currentHeight = sourceHeight

  if (transform.horizontalFlip) x = 1 - x
  if (transform.verticalFlip) y = 1 - y

  if (transform.rotation === 90) {
    ;[x, y] = [1 - y, x]
    ;[currentWidth, currentHeight] = [currentHeight, currentWidth]
  } else if (transform.rotation === 270) {
    ;[x, y] = [y, 1 - x]
    ;[currentWidth, currentHeight] = [currentHeight, currentWidth]
  }

  if (transform.resizeEnabled && transform.resizeMode !== 'stretch') {
    const widthRatio = currentWidth / Math.max(currentHeight, 1)
    const heightRatio = currentHeight / Math.max(currentWidth, 1)
    if (currentWidth >= currentHeight) {
      y = ((1 - heightRatio) / 2) + (y * heightRatio)
    } else {
      x = ((1 - widthRatio) / 2) + (x * widthRatio)
    }
  }

  x -= 0.5
  y -= 0.5

  if (Math.abs(transform.shearX) >= 0.5) {
    x += Math.tan((transform.shearX * Math.PI) / 180) * y * (currentHeight / Math.max(currentWidth, 1))
  }
  if (Math.abs(transform.shearY) >= 0.5) {
    y += Math.tan((transform.shearY * Math.PI) / 180) * x * (currentWidth / Math.max(currentHeight, 1))
  }

  if (Math.abs(transform.freeRotation) >= 0.25) {
    const radians = (transform.freeRotation * Math.PI) / 180
    const cos = Math.cos(radians)
    const sin = Math.sin(radians)
    const rotatedX = x * cos - y * sin
    const rotatedY = x * sin + y * cos
    x = rotatedX
    y = rotatedY
  }

  x += 0.5
  y += 0.5

  return [clamp01(x), clamp01(y)]
}

function computeOutputDimensions(width: number, height: number, transform: MaterializedTransform): [number, number] {
  if (transform.resizeEnabled) {
    return [transform.resizeSize, transform.resizeSize]
  }
  return transform.rotation === 90 || transform.rotation === 270
    ? [height, width]
    : [width, height]
}

function assertFormatCompatibility(format: VersionExportRequest['format'], samples: ResolvedSample[]): void {
  const supported: Record<VersionExportRequest['format'], Set<string>> = {
    yolo: new Set(['bbox', 'polygon']),
    coco: new Set(['bbox', 'polygon', 'mask']),
    voc: new Set(['bbox', 'polygon']),
    csv: new Set(['bbox', 'polygon', 'polyline', 'keypoints']),
  }

  const unsupportedTypes = new Set<string>()
  for (const sample of samples) {
    for (const annotation of sample.annotations) {
      if (!supported[format].has(annotation.annotation_type)) {
        unsupportedTypes.add(annotation.annotation_type)
      }
    }
  }

  if (unsupportedTypes.size > 0) {
    throw new Error(`The ${format.toUpperCase()} export cannot include these annotation types: ${Array.from(unsupportedTypes).join(', ')}.`)
  }
}

function hasPreprocessingEffect(recipe: AugmentationRecipe): boolean {
  return recipe.tiling_enabled
    || recipe.auto_orient_enabled
    || recipe.isolate_objects_enabled
    || recipe.resize_enabled
    || recipe.grayscale_enabled
    || recipe.adjust_contrast_enabled
}

function hasAugmentationEffect(recipe: AugmentationRecipe): boolean {
  return recipe.horizontal_flip_enabled
    || recipe.vertical_flip_enabled
    || recipe.rotate_cw90_enabled
    || recipe.rotate_cw270_enabled
    || (recipe.rotate_enabled && Math.abs(recipe.rotate_range) > 0)
    || (recipe.shear_enabled && (Math.abs(recipe.shear_x_range) > 0 || Math.abs(recipe.shear_y_range) > 0))
    || (recipe.brightness_enabled && Math.abs(recipe.brightness_range) > 0)
    || (recipe.contrast_enabled && Math.abs(recipe.contrast_range) > 0)
    || (recipe.saturation_enabled && Math.abs(recipe.saturation_range) > 0)
    || (recipe.hue_enabled && Math.abs(recipe.hue_range) > 0)
    || (recipe.blur_enabled && Math.abs(recipe.blur_range) > 0)
}

function normalizeResizeMode(value: ResizeMode): ResizeMode {
  return value === 'white_edges' || value === 'stretch' ? value : 'black_edges'
}

function normalizeContrastAdjustMode(value: ContrastAdjustMode): ContrastAdjustMode {
  return value === 'equalize' ? 'equalize' : 'stretch'
}

async function exportSamplesToYOLO(
  baseOutputDir: string,
  version: DatasetVersion,
  labels: LabelClass[],
  samples: ResolvedSample[],
  includeImages: boolean,
): Promise<ExportResult> {
  const versionDir = createVersionOutputDir(baseOutputDir, version, 'yolo')
  const splits = uniqueSplits(samples)
  let annotationCount = 0

  for (const split of splits) {
    mkdirSync(join(versionDir, 'images', split), { recursive: true })
    mkdirSync(join(versionDir, 'labels', split), { recursive: true })
  }

  for (const sample of samples) {
    const lines: string[] = []
    for (const annotation of sample.annotations) {
      const labelIndex = labels.findIndex((label) => label.id === annotation.label_class_id)
      if (labelIndex < 0) continue

      if (annotation.annotation_type === 'bbox' && annotation.geometry.type === 'bbox') {
        const { x, y, width, height } = annotation.geometry
        const cx = x + width / 2
        const cy = y + height / 2
        lines.push(`${labelIndex} ${cx.toFixed(6)} ${cy.toFixed(6)} ${width.toFixed(6)} ${height.toFixed(6)}`)
      } else if (annotation.annotation_type === 'polygon' && annotation.geometry.type === 'polygon') {
        const points = annotation.geometry.points.flatMap(([x, y]) => [x.toFixed(6), y.toFixed(6)])
        lines.push(`${labelIndex} ${points.join(' ')}`)
      }
    }

    const txtPath = join(versionDir, 'labels', sample.split, `${basename(sample.filename, extname(sample.filename))}.txt`)
    writeFileSync(txtPath, lines.join('\n'), 'utf-8')
    annotationCount += lines.length

    if (includeImages) {
      await writeSampleImage(sample, join(versionDir, 'images', sample.split, sample.filename))
    }
  }

  const yamlLines = [
    `path: ${versionDir}`,
    ...splits.map((split) => `${split}: images/${split}`),
    '',
    `nc: ${labels.length}`,
    `names: [${labels.map((label) => `'${label.name}'`).join(', ')}]`,
  ]
  writeFileSync(join(versionDir, 'data.yaml'), yamlLines.join('\n'), 'utf-8')

  return { output_path: versionDir, file_count: samples.length, annotation_count: annotationCount }
}

async function exportSamplesToCOCO(
  baseOutputDir: string,
  version: DatasetVersion,
  labels: LabelClass[],
  samples: ResolvedSample[],
  includeImages: boolean,
): Promise<ExportResult> {
  const versionDir = createVersionOutputDir(baseOutputDir, version, 'coco')
  if (includeImages) {
    for (const split of uniqueSplits(samples)) {
      mkdirSync(join(versionDir, 'images', split), { recursive: true })
    }
  }

  const categories = labels.map((label, index) => ({ id: index + 1, name: label.name, supercategory: 'object' }))
  const cocoImages: object[] = []
  const cocoAnnotations: object[] = []
  let annotationId = 1

  for (let index = 0; index < samples.length; index += 1) {
    const sample = samples[index]
    const imageId = index + 1
    const copiedPath = includeImages ? toPosixPath(join('images', sample.split, sample.filename)) : sample.filename

    cocoImages.push({
      id: imageId,
      file_name: copiedPath,
      width: sample.width,
      height: sample.height,
    })

    for (const annotation of sample.annotations) {
      const labelIndex = labels.findIndex((label) => label.id === annotation.label_class_id)
      if (labelIndex < 0) continue
      const categoryId = labelIndex + 1

      if (annotation.annotation_type === 'bbox' && annotation.geometry.type === 'bbox') {
        const { x, y, width, height } = annotation.geometry
        const absX = x * sample.width
        const absY = y * sample.height
        const absW = width * sample.width
        const absH = height * sample.height
        cocoAnnotations.push({
          id: annotationId++,
          image_id: imageId,
          category_id: categoryId,
          bbox: [absX, absY, absW, absH],
          area: absW * absH,
          segmentation: [],
          iscrowd: 0,
        })
      } else if (annotation.annotation_type === 'polygon' && annotation.geometry.type === 'polygon') {
        const absPoints = annotation.geometry.points.flatMap(([x, y]) => [x * sample.width, y * sample.height])
        const xs = absPoints.filter((_, pointIndex) => pointIndex % 2 === 0)
        const ys = absPoints.filter((_, pointIndex) => pointIndex % 2 === 1)
        const bboxX = Math.min(...xs)
        const bboxY = Math.min(...ys)
        const bboxW = Math.max(...xs) - bboxX
        const bboxH = Math.max(...ys) - bboxY
        cocoAnnotations.push({
          id: annotationId++,
          image_id: imageId,
          category_id: categoryId,
          bbox: [bboxX, bboxY, bboxW, bboxH],
          area: bboxW * bboxH,
          segmentation: [absPoints],
          iscrowd: 0,
        })
      } else if (annotation.annotation_type === 'mask' && annotation.geometry.type === 'mask') {
        const primaryContour = annotation.geometry.contours[0] ?? []
        if (primaryContour.length < 3) continue
        const absPoints = primaryContour.flatMap(([x, y]) => [x * sample.width, y * sample.height])
        const xs = absPoints.filter((_, pointIndex) => pointIndex % 2 === 0)
        const ys = absPoints.filter((_, pointIndex) => pointIndex % 2 === 1)
        const bboxX = Math.min(...xs)
        const bboxY = Math.min(...ys)
        const bboxW = Math.max(...xs) - bboxX
        const bboxH = Math.max(...ys) - bboxY
        cocoAnnotations.push({
          id: annotationId++,
          image_id: imageId,
          category_id: categoryId,
          bbox: [bboxX, bboxY, bboxW, bboxH],
          area: bboxW * bboxH,
          segmentation: [absPoints],
          iscrowd: 0,
        })
      }
    }

    if (includeImages) {
      await writeSampleImage(sample, join(versionDir, 'images', sample.split, sample.filename))
    }
  }

  const outputPath = join(versionDir, 'instances.json')
  writeFileSync(outputPath, JSON.stringify({
    info: {
      version: '1.0',
      description: `Exported from LabelIt (${version.name})`,
      date_created: new Date().toISOString(),
    },
    licenses: [],
    categories,
    images: cocoImages,
    annotations: cocoAnnotations,
  }, null, 2), 'utf-8')

  return { output_path: outputPath, file_count: samples.length, annotation_count: cocoAnnotations.length }
}

async function exportSamplesToVOC(
  baseOutputDir: string,
  version: DatasetVersion,
  labels: LabelClass[],
  samples: ResolvedSample[],
  includeImages: boolean,
): Promise<ExportResult> {
  const versionDir = createVersionOutputDir(baseOutputDir, version, 'voc')
  const annotationsDir = join(versionDir, 'Annotations')
  const imagesDir = join(versionDir, 'JPEGImages')
  mkdirSync(annotationsDir, { recursive: true })
  if (includeImages) mkdirSync(imagesDir, { recursive: true })

  let annotationCount = 0

  for (const sample of samples) {
    const baseName = basename(sample.filename, extname(sample.filename))
    const root = createXml({ version: '1.0', encoding: 'UTF-8' })
      .ele('annotation')
        .ele('folder').txt('JPEGImages').up()
        .ele('filename').txt(sample.filename).up()
        .ele('path').txt(includeImages ? join(imagesDir, sample.filename) : sample.file_path).up()
        .ele('size')
          .ele('width').txt(String(sample.width)).up()
          .ele('height').txt(String(sample.height)).up()
          .ele('depth').txt('3').up()
        .up()
        .ele('segmented').txt('0').up()

    for (const annotation of sample.annotations) {
      const label = labels.find((entry) => entry.id === annotation.label_class_id)
      if (!label) continue

      const obj = root.ele('object')
        .ele('name').txt(label.name).up()
        .ele('pose').txt('Unspecified').up()
        .ele('truncated').txt('0').up()
        .ele('difficult').txt('0').up()

      if (annotation.annotation_type === 'bbox' && annotation.geometry.type === 'bbox') {
        const { x, y, width, height } = annotation.geometry
        obj.ele('bndbox')
          .ele('xmin').txt(String(Math.round(x * sample.width))).up()
          .ele('ymin').txt(String(Math.round(y * sample.height))).up()
          .ele('xmax').txt(String(Math.round((x + width) * sample.width))).up()
          .ele('ymax').txt(String(Math.round((y + height) * sample.height))).up()
        .up()
        annotationCount += 1
      } else if (annotation.annotation_type === 'polygon' && annotation.geometry.type === 'polygon') {
        const xs = annotation.geometry.points.map(([x]) => x * sample.width)
        const ys = annotation.geometry.points.map(([, y]) => y * sample.height)
        obj.ele('bndbox')
          .ele('xmin').txt(String(Math.round(Math.min(...xs)))).up()
          .ele('ymin').txt(String(Math.round(Math.min(...ys)))).up()
          .ele('xmax').txt(String(Math.round(Math.max(...xs)))).up()
          .ele('ymax').txt(String(Math.round(Math.max(...ys)))).up()
        .up()

        const polygonEl = obj.ele('polygon')
        annotation.geometry.points.forEach(([x, y], pointIndex) => {
          polygonEl.ele(`x${pointIndex + 1}`).txt(String(Math.round(x * sample.width))).up()
          polygonEl.ele(`y${pointIndex + 1}`).txt(String(Math.round(y * sample.height))).up()
        })
        annotationCount += 1
      }

      obj.up()
    }

    writeFileSync(join(annotationsDir, `${baseName}.xml`), root.end({ prettyPrint: true }), 'utf-8')
    if (includeImages) {
      await writeSampleImage(sample, join(imagesDir, sample.filename))
    }
  }

  return { output_path: versionDir, file_count: samples.length, annotation_count: annotationCount }
}

async function exportSamplesToCSV(
  baseOutputDir: string,
  version: DatasetVersion,
  labels: LabelClass[],
  samples: ResolvedSample[],
  includeImages: boolean,
): Promise<ExportResult> {
  const versionDir = createVersionOutputDir(baseOutputDir, version, 'csv')
  mkdirSync(versionDir, { recursive: true })
  if (includeImages) {
    for (const split of uniqueSplits(samples)) {
      mkdirSync(join(versionDir, 'images', split), { recursive: true })
    }
  }

  const rows = ['filename,label,annotation_type,split,x_center,y_center,width,height,points,confidence,source']
  let annotationCount = 0

  for (const sample of samples) {
    for (const annotation of sample.annotations) {
      const labelName = labels.find((entry) => entry.id === annotation.label_class_id)?.name ?? ''
      let xCenter = ''
      let yCenter = ''
      let width = ''
      let height = ''
      let points = ''

      if (annotation.annotation_type === 'bbox' && annotation.geometry.type === 'bbox') {
        xCenter = (annotation.geometry.x + annotation.geometry.width / 2).toFixed(6)
        yCenter = (annotation.geometry.y + annotation.geometry.height / 2).toFixed(6)
        width = annotation.geometry.width.toFixed(6)
        height = annotation.geometry.height.toFixed(6)
      } else if (
        (annotation.annotation_type === 'polygon' || annotation.annotation_type === 'polyline')
        && (annotation.geometry.type === 'polygon' || annotation.geometry.type === 'polyline')
      ) {
        const xs = annotation.geometry.points.map(([x]) => x)
        const ys = annotation.geometry.points.map(([, y]) => y)
        const minX = Math.min(...xs)
        const maxX = Math.max(...xs)
        const minY = Math.min(...ys)
        const maxY = Math.max(...ys)
        xCenter = ((minX + maxX) / 2).toFixed(6)
        yCenter = ((minY + maxY) / 2).toFixed(6)
        width = (maxX - minX).toFixed(6)
        height = (maxY - minY).toFixed(6)
        points = `"${annotation.geometry.points.map(([x, y]) => `${x.toFixed(4)} ${y.toFixed(4)}`).join(';')}"`
      } else if (annotation.annotation_type === 'keypoints' && annotation.geometry.type === 'keypoints') {
        points = `"${annotation.geometry.keypoints.map((keypoint) => `${keypoint.x.toFixed(4)} ${keypoint.y.toFixed(4)} ${keypoint.visibility}`).join(';')}"`
      }

      rows.push([
        csvEscape(sample.filename),
        csvEscape(labelName),
        annotation.annotation_type,
        sample.split,
        xCenter,
        yCenter,
        width,
        height,
        points,
        annotation.confidence != null ? annotation.confidence.toFixed(4) : '',
        annotation.source,
      ].join(','))
      annotationCount += 1
    }

    if (includeImages) {
      await writeSampleImage(sample, join(versionDir, 'images', sample.split, sample.filename))
    }
  }

  const outputPath = join(versionDir, 'annotations.csv')
  writeFileSync(outputPath, rows.join('\n'), 'utf-8')
  return { output_path: outputPath, file_count: samples.length, annotation_count: annotationCount }
}

function createVersionOutputDir(baseOutputDir: string, version: DatasetVersion, format: string): string {
  const dir = join(baseOutputDir, `${slugify(version.name)}-${version.id.slice(0, 8)}-${format}`)
  mkdirSync(dir, { recursive: true })
  return dir
}

async function writeSampleImage(sample: ResolvedSample, destinationPath: string): Promise<void> {
  if (!existsSync(sample.file_path)) return

  if (sample.transform == null && sample.tile == null) {
    copyFileSync(sample.file_path, destinationPath)
    return
  }

  let pipeline = sharp(sample.file_path)

  if (sample.tile != null) {
    pipeline = pipeline.extract({
      left: sample.tile.left,
      top: sample.tile.top,
      width: sample.tile.width,
      height: sample.tile.height,
    })
  }

  if (sample.transform?.autoOrientEnabled) {
    pipeline = pipeline.rotate()
  }
  if (sample.transform?.horizontalFlip) pipeline = pipeline.flop()
  if (sample.transform?.verticalFlip) pipeline = pipeline.flip()
  if (sample.transform != null && sample.transform.rotation !== 0) pipeline = pipeline.rotate(sample.transform.rotation)

  if (sample.transform?.resizeEnabled) {
    const resizeBackground = sample.transform.resizeMode === 'white_edges'
      ? { r: 255, g: 255, b: 255, alpha: 1 }
      : { r: 0, g: 0, b: 0, alpha: 1 }

    pipeline = pipeline.resize(sample.transform.resizeSize, sample.transform.resizeSize, {
      fit: sample.transform.resizeMode === 'stretch' ? 'fill' : 'contain',
      background: resizeBackground,
    })
  }

  if (sample.transform != null && (Math.abs(sample.transform.shearX) >= 0.5 || Math.abs(sample.transform.shearY) >= 0.5)) {
    const shearX = Math.tan((sample.transform.shearX * Math.PI) / 180)
    const shearY = Math.tan((sample.transform.shearY * Math.PI) / 180)
    pipeline = pipeline.affine([1, shearX, shearY, 1], {
      background: sample.transform.resizeMode === 'white_edges'
        ? { r: 255, g: 255, b: 255, alpha: 1 }
        : { r: 0, g: 0, b: 0, alpha: 1 },
      interpolator: sharp.interpolators.bicubic,
    }).resize(sample.width, sample.height, { fit: 'fill' })
  }

  if (sample.transform != null && Math.abs(sample.transform.freeRotation) >= 0.25) {
    pipeline = pipeline.rotate(sample.transform.freeRotation, {
      background: sample.transform.resizeMode === 'white_edges'
        ? { r: 255, g: 255, b: 255, alpha: 1 }
        : { r: 0, g: 0, b: 0, alpha: 1 },
    })
  }

  if (sample.transform?.adjustContrastMode === 'stretch') {
    pipeline = pipeline.normalise()
  } else if (sample.transform?.adjustContrastMode === 'equalize') {
    pipeline = pipeline.clahe({ width: 3, height: 3, maxSlope: 3 })
  }

  if (sample.transform?.grayscaleEnabled) pipeline = pipeline.grayscale()

  if (sample.transform != null && Math.abs(sample.transform.brightnessDelta) >= 0.01) {
    pipeline = pipeline.linear(1, sample.transform.brightnessDelta * 255)
  }

  const modulate: { saturation?: number; hue?: number } = {}
  if (sample.transform != null && Math.abs(sample.transform.saturationDelta) >= 0.01) modulate.saturation = 1 + sample.transform.saturationDelta
  if (sample.transform != null && Math.abs(sample.transform.hueDelta) >= 0.5) modulate.hue = normalizeHue(sample.transform.hueDelta)
  if (Object.keys(modulate).length > 0) pipeline = pipeline.modulate(modulate)

  if (sample.transform != null && Math.abs(sample.transform.contrastDelta) >= 0.01) {
    pipeline = pipeline.gamma(Math.max(0.1, 1 + sample.transform.contrastDelta))
  }
  if (sample.transform != null && sample.transform.blurSigma >= 0.1) {
    pipeline = pipeline.blur(sample.transform.blurSigma)
  }

  await pipeline.toFile(destinationPath)
}

function buildAugmentedFilename(filename: string, versionName: string, copyIndex: number): string {
  const extension = extname(filename)
  const stem = basename(filename, extension)
  return `${stem}__${slugify(versionName)}_${copyIndex}${extension}`
}

function buildTiledFilename(filename: string, row: number, col: number): string {
  const extension = extname(filename)
  const stem = basename(filename, extension)
  return `${stem}__tile_r${row}_c${col}${extension}`
}

function uniqueSplits(samples: ResolvedSample[]): SplitType[] {
  return SPLIT_ORDER.filter((split) => samples.some((sample) => sample.split === split))
}

function csvEscape(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'dataset-version'
}

function toPosixPath(value: string): string {
  return value.replace(/\\/g, '/')
}

function normalizeHue(value: number): number {
  const normalized = value % 360
  return normalized < 0 ? normalized + 360 : normalized
}

function hashString(value: string): number {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function mulberry32(seed: number): () => number {
  return () => {
    let next = seed += 0x6d2b79f5
    next = Math.imul(next ^ (next >>> 15), next | 1)
    next ^= next + Math.imul(next ^ (next >>> 7), next | 61)
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296
  }
}

function pick<T>(values: readonly T[], rng: () => number): T {
  return values[Math.floor(rng() * values.length)]
}

function randomRange(rng: () => number, min: number, max: number): number {
  return min + (max - min) * rng()
}

function clamp01(value: number): number {
  return clampNumber(value, 0, 1)
}

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.max(min, Math.min(max, value))
}

function clampSigned(value: number, max: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(-max, Math.min(max, value))
}

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.max(min, Math.min(max, Math.round(value)))
}

export function getDefaultRecipe(): AugmentationRecipe {
  return { ...DEFAULT_RECIPE }
}
