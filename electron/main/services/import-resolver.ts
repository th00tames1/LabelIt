import { existsSync, readdirSync, readFileSync } from 'fs'
import { basename, dirname, extname, isAbsolute, join, parse, relative, resolve } from 'path'
import type { AnnotationGeometry } from '../db/schema'

type ImportedAnnotationType = 'bbox' | 'polygon' | 'polyline'

export interface ImportedAnnotationInput {
  labelName: string
  annotation_type: ImportedAnnotationType
  geometry: AnnotationGeometry
  confidence?: number | null
}

export interface AnnotationResolver {
  resolveForImage: (imagePath: string, imageWidth: number, imageHeight: number) => ImportedAnnotationInput[]
}

interface ImportedAnnotationSeed {
  labelName: string
  confidence?: number | null
  build: (imageWidth: number, imageHeight: number) => ImportedAnnotationInput | null
}

type CoordinateMode = 'normalized' | 'absolute' | 'auto'

interface AnnotationLookup {
  records: Map<string, ImportedAnnotationSeed[]>
  fileNameRefs: Map<string, string | null>
  stemRefs: Map<string, string | null>
}

const IMAGE_DIR_NAMES = new Set(['images', 'jpegimages', 'imgs'])
const IGNORED_DIR_NAMES = new Set(['.git', 'node_modules', '.venv', '__pycache__'])

export function createAnnotationResolver(imagePaths: string[], explicitRoots: string[] = []): AnnotationResolver {
  const roots = inferSearchRoots(imagePaths, explicitRoots)
  const { jsonFiles, csvFiles, xmlFiles } = collectDatasetFiles(roots)
  const cocoLookup = buildCocoLookup(jsonFiles)
  const csvLookup = buildCsvLookup(csvFiles)
  const vocLookup = buildVocLookup(xmlFiles)
  const yoloCache = new Map<string, ImportedAnnotationSeed[]>()
  const classNameCache = new Map<string, string[]>()

  return {
    resolveForImage(imagePath, imageWidth, imageHeight) {
      const yoloSeeds = resolveYoloSeeds(imagePath, roots, yoloCache, classNameCache)
      if (yoloSeeds.length > 0) return materializeSeeds(yoloSeeds, imageWidth, imageHeight)

      const vocSeeds = resolveLookup(vocLookup, imagePath, roots)
      if (vocSeeds.length > 0) return materializeSeeds(vocSeeds, imageWidth, imageHeight)

      const cocoSeeds = resolveLookup(cocoLookup, imagePath, roots)
      if (cocoSeeds.length > 0) return materializeSeeds(cocoSeeds, imageWidth, imageHeight)

      const csvSeeds = resolveLookup(csvLookup, imagePath, roots)
      if (csvSeeds.length > 0) return materializeSeeds(csvSeeds, imageWidth, imageHeight)

      return []
    },
  }
}

function materializeSeeds(
  seeds: ImportedAnnotationSeed[],
  imageWidth: number,
  imageHeight: number,
): ImportedAnnotationInput[] {
  const imported: ImportedAnnotationInput[] = []

  for (const seed of seeds) {
    const built = seed.build(imageWidth, imageHeight)
    if (built) imported.push(built)
  }

  return imported
}

function createAnnotationLookup(): AnnotationLookup {
  return {
    records: new Map(),
    fileNameRefs: new Map(),
    stemRefs: new Map(),
  }
}

function addLookupSeed(lookup: AnnotationLookup, reference: string, seed: ImportedAnnotationSeed): void {
  const refKey = normalizeLookupKey(reference)
  if (!refKey) return

  const existing = lookup.records.get(refKey)
  if (existing) existing.push(seed)
  else lookup.records.set(refKey, [seed])

  registerAlias(lookup.fileNameRefs, normalizeLookupKey(basename(reference)), refKey)
  registerAlias(lookup.stemRefs, normalizeLookupKey(basename(reference, extname(reference))), refKey)
}

function registerAlias(map: Map<string, string | null>, alias: string, refKey: string): void {
  if (!alias) return
  const existing = map.get(alias)
  if (existing === undefined) {
    map.set(alias, refKey)
    return
  }
  if (existing !== refKey) map.set(alias, null)
}

function resolveLookup(lookup: AnnotationLookup, imagePath: string, roots: string[]): ImportedAnnotationSeed[] {
  for (const key of getExactImageKeys(imagePath, roots)) {
    const found = lookup.records.get(key)
    if (found) return found
  }

  const fileNameKey = normalizeLookupKey(basename(imagePath))
  const fileNameRef = lookup.fileNameRefs.get(fileNameKey)
  if (fileNameRef) {
    const found = lookup.records.get(fileNameRef)
    if (found) return found
  }

  const stemKey = normalizeLookupKey(basename(imagePath, extname(imagePath)))
  const stemRef = lookup.stemRefs.get(stemKey)
  if (stemRef) {
    const found = lookup.records.get(stemRef)
    if (found) return found
  }

  return []
}

function getExactImageKeys(imagePath: string, roots: string[]): string[] {
  const keys = new Set<string>()
  const resolvedImagePath = resolve(imagePath)
  keys.add(normalizeLookupKey(resolvedImagePath))

  for (const root of roots) {
    if (!isWithinRoot(root, resolvedImagePath)) continue
    keys.add(normalizeLookupKey(relative(root, resolvedImagePath)))
  }

  return Array.from(keys).filter(Boolean)
}

function inferSearchRoots(imagePaths: string[], explicitRoots: string[]): string[] {
  const candidates = new Set<string>()

  explicitRoots.forEach((root) => {
    if (root) candidates.add(resolve(root))
  })
  imagePaths.forEach((filePath) => candidates.add(resolve(dirname(filePath))))

  const commonAncestor = getCommonAncestor(imagePaths)
  if (commonAncestor) candidates.add(commonAncestor)

  const expanded = new Set<string>()
  for (const root of candidates) {
    deriveDatasetRootCandidates(root).forEach((candidate) => {
      if (!isDriveRoot(candidate)) expanded.add(candidate)
    })
  }

  const pruned = pruneNestedRoots(Array.from(expanded))
  if (pruned.length > 0) return pruned

  return pruneNestedRoots(Array.from(candidates).filter((root) => !isDriveRoot(root)))
}

function deriveDatasetRootCandidates(rootPath: string): string[] {
  const results = new Set<string>()
  let current = resolve(rootPath)

  results.add(current)

  while (true) {
    if (IMAGE_DIR_NAMES.has(basename(current).toLowerCase())) {
      const parent = dirname(current)
      if (parent !== current) results.add(parent)
    }
    const parent = dirname(current)
    if (parent === current) break
    current = parent
  }

  return Array.from(results)
}

function pruneNestedRoots(roots: string[]): string[] {
  const unique = Array.from(new Set(roots.map((root) => resolve(root))))
    .sort((a, b) => a.length - b.length)

  const kept: string[] = []
  for (const root of unique) {
    if (kept.some((existing) => isWithinRoot(existing, root))) continue
    kept.push(root)
  }

  return kept
}

function getCommonAncestor(imagePaths: string[]): string | null {
  if (imagePaths.length === 0) return null

  let ancestor = resolve(dirname(imagePaths[0]))
  for (const imagePath of imagePaths.slice(1)) {
    const imageDir = resolve(dirname(imagePath))
    while (!isWithinRoot(ancestor, imageDir)) {
      const parent = dirname(ancestor)
      if (parent === ancestor) return null
      ancestor = parent
    }
  }

  return ancestor
}

function isWithinRoot(rootPath: string, targetPath: string): boolean {
  const rel = relative(resolve(rootPath), resolve(targetPath))
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
}

function isDriveRoot(rootPath: string): boolean {
  return resolve(rootPath).toLowerCase() === parse(resolve(rootPath)).root.toLowerCase()
}

function collectDatasetFiles(roots: string[]): { jsonFiles: string[]; csvFiles: string[]; xmlFiles: string[] } {
  const jsonFiles = new Set<string>()
  const csvFiles = new Set<string>()
  const xmlFiles = new Set<string>()

  for (const root of roots) {
    collectFilesRecursively(root, (fullPath) => {
      const extension = extname(fullPath).toLowerCase()
      if (extension === '.json') jsonFiles.add(fullPath)
      else if (extension === '.csv') csvFiles.add(fullPath)
      else if (extension === '.xml') xmlFiles.add(fullPath)
    })
  }

  return {
    jsonFiles: Array.from(jsonFiles),
    csvFiles: Array.from(csvFiles),
    xmlFiles: Array.from(xmlFiles),
  }
}

function collectFilesRecursively(rootPath: string, onFile: (fullPath: string) => void): void {
  try {
    const entries = readdirSync(rootPath, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = join(rootPath, entry.name)
      if (entry.isDirectory()) {
        if (IGNORED_DIR_NAMES.has(entry.name.toLowerCase())) continue
        collectFilesRecursively(fullPath, onFile)
        continue
      }
      onFile(fullPath)
    }
  } catch {
    // Ignore unreadable directories.
  }
}

function resolveYoloSeeds(
  imagePath: string,
  roots: string[],
  seedCache: Map<string, ImportedAnnotationSeed[]>,
  classNameCache: Map<string, string[]>,
): ImportedAnnotationSeed[] {
  for (const labelPath of getYoloCandidatePaths(imagePath, roots)) {
    if (!existsSync(labelPath)) continue
    const cached = seedCache.get(labelPath)
    if (cached !== undefined) {
      if (cached.length > 0) return cached
      continue
    }

    const classNames = loadYoloClassNames(labelPath, roots, classNameCache)
    const seeds = parseYoloLabelFile(labelPath, classNames)
    seedCache.set(labelPath, seeds)
    if (seeds.length > 0) return seeds
  }

  return []
}

function getYoloCandidatePaths(imagePath: string, roots: string[]): string[] {
  const baseName = basename(imagePath, extname(imagePath))
  const candidates = new Set<string>([
    join(dirname(imagePath), `${baseName}.txt`),
  ])

  for (const root of roots) {
    if (!isWithinRoot(root, imagePath)) continue

    const relPath = relative(root, imagePath)
    const relWithoutExt = relPath.slice(0, relPath.length - extname(relPath).length)
    candidates.add(join(root, `${relWithoutExt}.txt`))
    candidates.add(join(root, 'labels', `${baseName}.txt`))

    const relSegments = relWithoutExt.split(/[/\\]+/).filter(Boolean)
    const replacedSegments = relSegments.map((segment) => (
      IMAGE_DIR_NAMES.has(segment.toLowerCase()) ? 'labels' : segment
    ))

    if (replacedSegments.join('/') !== relSegments.join('/')) {
      candidates.add(join(root, ...replacedSegments) + '.txt')
    }
  }

  return Array.from(candidates)
}

function loadYoloClassNames(labelPath: string, roots: string[], cache: Map<string, string[]>): string[] {
  const searchDirs: string[] = []
  let current = dirname(labelPath)

  while (true) {
    searchDirs.push(current)
    if (roots.some((root) => resolve(root) === current)) break
    const parent = dirname(current)
    if (parent === current) break
    current = parent
  }

  roots.forEach((root) => {
    const resolvedRoot = resolve(root)
    if (!searchDirs.includes(resolvedRoot)) searchDirs.push(resolvedRoot)
  })

  for (const searchDir of searchDirs) {
    const resolvedDir = resolve(searchDir)
    const cached = cache.get(resolvedDir)
    if (cached !== undefined) {
      if (cached.length > 0) return cached
      continue
    }

    const classNames = loadCompanionClassNames(resolvedDir)
    if (classNames.length > 0) {
      cache.set(resolvedDir, classNames)
      return classNames
    }

    cache.set(resolvedDir, [])
  }

  return []
}

function parseYoloLabelFile(labelPath: string, classNames: string[]): ImportedAnnotationSeed[] {
  const seeds: ImportedAnnotationSeed[] = []
  const lines = readFileSync(labelPath, 'utf-8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  for (const line of lines) {
    const tokens = line.split(/\s+/)
    if (tokens.length < 5) continue

    const classIndex = Number(tokens[0])
    if (!Number.isFinite(classIndex)) continue
    const labelName = classNames[classIndex] ?? `class_${classIndex}`

    if (tokens.length === 5) {
      const [cx, cy, width, height] = tokens.slice(1).map(Number)
      const seed = createCenteredBBoxSeed(labelName, cx, cy, width, height, 'normalized')
      if (seed) seeds.push(seed)
      continue
    }

    const coords = tokens.slice(1).map(Number)
    if (coords.length >= 6 && coords.length % 2 === 0) {
      const points = pairNumbers(coords)
      const seed = createPointsSeed(labelName, 'polygon', points, 'normalized')
      if (seed) seeds.push(seed)
    }
  }

  return seeds
}

function buildCocoLookup(jsonFiles: string[]): AnnotationLookup {
  const lookup = createAnnotationLookup()

  for (const jsonPath of jsonFiles) {
    try {
      const raw = JSON.parse(readFileSync(jsonPath, 'utf-8')) as {
        images?: Array<{ id: string | number; file_name?: string }>
        annotations?: Array<{
          image_id?: string | number
          category_id?: string | number
          bbox?: unknown
          segmentation?: unknown
          score?: unknown
        }>
        categories?: Array<{ id: string | number; name?: string }>
      }

      if (!Array.isArray(raw.images) || !Array.isArray(raw.annotations) || !Array.isArray(raw.categories)) {
        continue
      }

      const imageNameById = new Map<string, string>()
      raw.images.forEach((image) => {
        if (image.file_name) imageNameById.set(String(image.id), image.file_name)
      })

      const categoryNameById = new Map<string, string>()
      raw.categories.forEach((category) => {
        const name = category.name?.trim()
        if (name) categoryNameById.set(String(category.id), name)
      })

      for (const annotation of raw.annotations) {
        const reference = imageNameById.get(String(annotation.image_id))
        const labelName = categoryNameById.get(String(annotation.category_id))
        if (!reference || !labelName) continue

        const confidence = toOptionalFiniteNumber(annotation.score)
        const polygonGroups = extractCocoPolygons(annotation.segmentation)
        if (polygonGroups.length > 0) {
          polygonGroups.forEach((polygonPoints) => {
            const seed = createPointsSeed(labelName, 'polygon', polygonPoints, 'absolute', confidence)
            if (seed) addLookupSeed(lookup, reference, seed)
          })
          continue
        }

        const bbox = Array.isArray(annotation.bbox) ? annotation.bbox.map(toFiniteNumber) : []
        if (bbox.length >= 4) {
          const [x, y, width, height] = bbox
          const seed = createBBoxSeed(labelName, x, y, width, height, 'absolute', confidence)
          if (seed) addLookupSeed(lookup, reference, seed)
        }
      }
    } catch {
      // Ignore non-COCO or malformed JSON files.
    }
  }

  return lookup
}

function extractCocoPolygons(segmentation: unknown): [number, number][][] {
  if (!Array.isArray(segmentation)) return []

  const polygons: [number, number][][] = []

  for (const candidate of segmentation) {
    if (!Array.isArray(candidate)) continue
    const flat = candidate.map(toFiniteNumber).filter((value) => Number.isFinite(value))
    if (flat.length >= 6 && flat.length % 2 === 0) polygons.push(pairNumbers(flat))
  }

  if (polygons.length > 0) return polygons

  const flat = segmentation.map(toFiniteNumber).filter((value) => Number.isFinite(value))
  if (flat.length >= 6 && flat.length % 2 === 0) return [pairNumbers(flat)]
  return []
}

function buildCsvLookup(csvFiles: string[]): AnnotationLookup {
  const lookup = createAnnotationLookup()

  for (const csvPath of csvFiles) {
    try {
      const rows = parseCsvRows(readFileSync(csvPath, 'utf-8'))
      if (rows.length < 2) continue

      const header = rows[0].map((value) => value.trim().toLowerCase())
      const filenameIndex = header.findIndex((value) => value === 'filename' || value === 'file_name')
      const labelIndex = header.findIndex((value) => value === 'label' || value === 'class')
      const typeIndex = header.findIndex((value) => value === 'annotation_type' || value === 'type')
      const pointsIndex = header.indexOf('points')
      const xCenterIndex = header.findIndex((value) => value === 'x_center' || value === 'xc')
      const yCenterIndex = header.findIndex((value) => value === 'y_center' || value === 'yc')
      const widthIndex = header.indexOf('width')
      const heightIndex = header.indexOf('height')
      const confidenceIndex = header.indexOf('confidence')

      if (filenameIndex < 0 || labelIndex < 0 || typeIndex < 0) continue

      for (const row of rows.slice(1)) {
        const reference = (row[filenameIndex] ?? '').trim()
        const labelName = (row[labelIndex] ?? '').trim()
        const annotationType = (row[typeIndex] ?? '').trim().toLowerCase()
        if (!reference || !labelName) continue

        const confidence = confidenceIndex >= 0 ? toOptionalFiniteNumber(row[confidenceIndex]) : undefined

        if (annotationType === 'bbox') {
          const xCenter = toFiniteNumber(row[xCenterIndex])
          const yCenter = toFiniteNumber(row[yCenterIndex])
          const width = toFiniteNumber(row[widthIndex])
          const height = toFiniteNumber(row[heightIndex])
          const seed = createCenteredBBoxSeed(labelName, xCenter, yCenter, width, height, 'auto', confidence)
          if (seed) addLookupSeed(lookup, reference, seed)
          continue
        }

        if (annotationType === 'polygon' || annotationType === 'polyline') {
          const points = parseDelimitedPoints(row[pointsIndex] ?? '')
          const seed = createPointsSeed(labelName, annotationType, points, 'auto', confidence)
          if (seed) addLookupSeed(lookup, reference, seed)
        }
      }
    } catch {
      // Ignore malformed CSV files.
    }
  }

  return lookup
}

function buildVocLookup(xmlFiles: string[]): AnnotationLookup {
  const lookup = createAnnotationLookup()

  for (const xmlPath of xmlFiles) {
    try {
      const xmlText = readFileSync(xmlPath, 'utf-8')
      if (!xmlText.includes('<annotation')) continue

      const reference = readXmlTag(xmlText, 'filename')?.trim() || basename(xmlPath, extname(xmlPath))
      const objectBlocks = Array.from(xmlText.matchAll(/<object>([\s\S]*?)<\/object>/gi))
      for (const match of objectBlocks) {
        const objectText = match[1]
        const labelName = readXmlTag(objectText, 'name')?.trim()
        if (!labelName) continue

        const polygonPoints = parseVocPolygon(objectText)
        if (polygonPoints.length >= 3) {
          const seed = createPointsSeed(labelName, 'polygon', polygonPoints, 'absolute')
          if (seed) addLookupSeed(lookup, reference, seed)
          continue
        }

        const bbox = parseVocBBox(objectText)
        if (bbox) {
          const seed = createBBoxSeed(labelName, bbox.x, bbox.y, bbox.width, bbox.height, 'absolute')
          if (seed) addLookupSeed(lookup, reference, seed)
        }
      }
    } catch {
      // Ignore malformed XML files.
    }
  }

  return lookup
}

function parseVocBBox(objectText: string): { x: number; y: number; width: number; height: number } | null {
  const bboxText = readXmlTag(objectText, 'bndbox')
  if (!bboxText) return null

  const xmin = toFiniteNumber(readXmlTag(bboxText, 'xmin'))
  const ymin = toFiniteNumber(readXmlTag(bboxText, 'ymin'))
  const xmax = toFiniteNumber(readXmlTag(bboxText, 'xmax'))
  const ymax = toFiniteNumber(readXmlTag(bboxText, 'ymax'))
  if (![xmin, ymin, xmax, ymax].every((value) => Number.isFinite(value))) return null

  return {
    x: xmin,
    y: ymin,
    width: xmax - xmin,
    height: ymax - ymin,
  }
}

function parseVocPolygon(objectText: string): [number, number][] {
  const polygonText = readXmlTag(objectText, 'polygon')
  if (!polygonText) return []

  const xs = new Map<number, number>()
  const ys = new Map<number, number>()

  Array.from(polygonText.matchAll(/<x(\d+)>([\s\S]*?)<\/x\1>/gi)).forEach((match) => {
    const index = Number(match[1])
    const value = toFiniteNumber(match[2])
    if (Number.isFinite(index) && Number.isFinite(value)) xs.set(index, value)
  })
  Array.from(polygonText.matchAll(/<y(\d+)>([\s\S]*?)<\/y\1>/gi)).forEach((match) => {
    const index = Number(match[1])
    const value = toFiniteNumber(match[2])
    if (Number.isFinite(index) && Number.isFinite(value)) ys.set(index, value)
  })

  return Array.from(xs.keys())
    .filter((index) => ys.has(index))
    .sort((a, b) => a - b)
    .map((index) => [xs.get(index)!, ys.get(index)!] as [number, number])
}

function readXmlTag(xmlText: string, tagName: string): string | null {
  const match = xmlText.match(new RegExp(`<${tagName}>([\\s\\S]*?)<\\/${tagName}>`, 'i'))
  return match ? decodeXmlEntities(match[1]) : null
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

function parseCsvRows(text: string): string[][] {
  const rows: string[][] = []
  let currentRow: string[] = []
  let currentValue = ''
  let inQuotes = false
  const normalized = text.replace(/^\uFEFF/, '')

  for (let index = 0; index < normalized.length; index += 1) {
    const char = normalized[index]

    if (char === '"') {
      if (inQuotes && normalized[index + 1] === '"') {
        currentValue += '"'
        index += 1
      } else {
        inQuotes = !inQuotes
      }
      continue
    }

    if (!inQuotes && char === ',') {
      currentRow.push(currentValue)
      currentValue = ''
      continue
    }

    if (!inQuotes && (char === '\n' || char === '\r')) {
      if (char === '\r' && normalized[index + 1] === '\n') index += 1
      currentRow.push(currentValue)
      if (currentRow.some((value) => value.length > 0)) rows.push(currentRow)
      currentRow = []
      currentValue = ''
      continue
    }

    currentValue += char
  }

  currentRow.push(currentValue)
  if (currentRow.some((value) => value.length > 0)) rows.push(currentRow)
  return rows
}

function parseDelimitedPoints(value: string): [number, number][] {
  return value
    .split(';')
    .map((segment) => segment.trim())
    .filter(Boolean)
    .map((segment) => segment.split(/[\s,]+/).map(toFiniteNumber).filter((part) => Number.isFinite(part)))
    .filter((parts) => parts.length >= 2)
    .map((parts) => [parts[0], parts[1]] as [number, number])
}

function createBBoxSeed(
  labelName: string,
  x: number,
  y: number,
  width: number,
  height: number,
  mode: CoordinateMode,
  confidence?: number | null,
): ImportedAnnotationSeed | null {
  if (![x, y, width, height].every((value) => Number.isFinite(value))) return null

  return {
    labelName,
    confidence,
    build(imageWidth, imageHeight) {
      const nx = normalizeCoordinate(x, imageWidth, mode)
      const ny = normalizeCoordinate(y, imageHeight, mode)
      const nw = normalizeCoordinate(width, imageWidth, mode)
      const nh = normalizeCoordinate(height, imageHeight, mode)
      if (![nx, ny, nw, nh].every((value) => Number.isFinite(value))) return null

      const minX = clamp01(Math.min(nx, nx + nw))
      const maxX = clamp01(Math.max(nx, nx + nw))
      const minY = clamp01(Math.min(ny, ny + nh))
      const maxY = clamp01(Math.max(ny, ny + nh))
      if (maxX - minX <= 0 || maxY - minY <= 0) return null

      return {
        labelName,
        annotation_type: 'bbox',
        geometry: {
          type: 'bbox',
          x: minX,
          y: minY,
          width: maxX - minX,
          height: maxY - minY,
        },
        confidence,
      }
    },
  }
}

function createCenteredBBoxSeed(
  labelName: string,
  xCenter: number,
  yCenter: number,
  width: number,
  height: number,
  mode: CoordinateMode,
  confidence?: number | null,
): ImportedAnnotationSeed | null {
  if (![xCenter, yCenter, width, height].every((value) => Number.isFinite(value))) return null

  return {
    labelName,
    confidence,
    build(imageWidth, imageHeight) {
      const nxCenter = normalizeCoordinate(xCenter, imageWidth, mode)
      const nyCenter = normalizeCoordinate(yCenter, imageHeight, mode)
      const nw = normalizeCoordinate(width, imageWidth, mode)
      const nh = normalizeCoordinate(height, imageHeight, mode)
      if (![nxCenter, nyCenter, nw, nh].every((value) => Number.isFinite(value))) return null

      const minX = clamp01(nxCenter - nw / 2)
      const maxX = clamp01(nxCenter + nw / 2)
      const minY = clamp01(nyCenter - nh / 2)
      const maxY = clamp01(nyCenter + nh / 2)
      if (maxX - minX <= 0 || maxY - minY <= 0) return null

      return {
        labelName,
        annotation_type: 'bbox',
        geometry: {
          type: 'bbox',
          x: minX,
          y: minY,
          width: maxX - minX,
          height: maxY - minY,
        },
        confidence,
      }
    },
  }
}

function createPointsSeed(
  labelName: string,
  annotationType: 'polygon' | 'polyline',
  points: [number, number][],
  mode: CoordinateMode,
  confidence?: number | null,
): ImportedAnnotationSeed | null {
  if (points.length === 0) return null

  return {
    labelName,
    confidence,
    build(imageWidth, imageHeight) {
      const normalizedPoints = points
        .map(([x, y]) => [
          normalizeCoordinate(x, imageWidth, mode),
          normalizeCoordinate(y, imageHeight, mode),
        ] as [number, number])
        .filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y))
        .map(([x, y]) => [clamp01(x), clamp01(y)] as [number, number])

      if (annotationType === 'polygon' && normalizedPoints.length < 3) return null
      if (annotationType === 'polyline' && normalizedPoints.length < 2) return null

      return {
        labelName,
        annotation_type: annotationType,
        geometry: {
          type: annotationType,
          points: normalizedPoints,
        },
        confidence,
      }
    },
  }
}

function normalizeCoordinate(value: number, dimension: number, mode: CoordinateMode): number {
  if (!Number.isFinite(value)) return Number.NaN
  if (mode === 'normalized') return value
  if (mode === 'auto' && Math.abs(value) <= 1) return value
  if (dimension <= 0) return Number.NaN
  return value / dimension
}

function pairNumbers(values: number[]): [number, number][] {
  const pairs: [number, number][] = []
  for (let index = 0; index + 1 < values.length; index += 2) {
    pairs.push([values[index], values[index + 1]])
  }
  return pairs
}

function toFiniteNumber(value: unknown): number {
  if (typeof value === 'number') return value
  if (typeof value === 'string' && value.trim()) return Number(value)
  return Number.NaN
}

function toOptionalFiniteNumber(value: unknown): number | undefined {
  const parsed = toFiniteNumber(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}

function normalizeLookupKey(value: string): string {
  return value
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\.\//, '')
    .replace(/^\//, '')
    .replace(/\/+/g, '/')
    .toLowerCase()
}

function loadCompanionClassNames(folderPath: string): string[] {
  const classesTxt = join(folderPath, 'classes.txt')
  if (existsSync(classesTxt)) {
    return readFileSync(classesTxt, 'utf-8')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
  }

  const dataYaml = join(folderPath, 'data.yaml')
  if (existsSync(dataYaml)) {
    const parsed = parseDataYamlNames(readFileSync(dataYaml, 'utf-8'))
    if (parsed.length > 0) return parsed
  }

  return []
}

function parseDataYamlNames(text: string): string[] {
  const inlineMatch = text.match(/names:\s*\[(.*?)\]/s)
  if (inlineMatch) {
    return inlineMatch[1]
      .split(',')
      .map((item) => item.trim().replace(/^['"]|['"]$/g, ''))
      .filter(Boolean)
  }

  const lines = text.split(/\r?\n/)
  const collected = new Map<number, string>()
  let collecting = false

  for (const rawLine of lines) {
    const line = rawLine.replace(/\t/g, '  ')
    const trimmed = line.trim()
    if (!collecting) {
      if (/^names:\s*$/.test(trimmed)) {
        collecting = true
      }
      continue
    }

    if (!trimmed) continue
    if (!/^\s/.test(line)) break

    const indexed = trimmed.match(/^(\d+)\s*:\s*(.+)$/)
    if (indexed) {
      collected.set(Number(indexed[1]), indexed[2].trim().replace(/^['"]|['"]$/g, ''))
      continue
    }

    const listed = trimmed.match(/^[-]\s*(.+)$/)
    if (listed) {
      collected.set(collected.size, listed[1].trim().replace(/^['"]|['"]$/g, ''))
      continue
    }

    break
  }

  return Array.from(collected.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([, value]) => value)
    .filter(Boolean)
}
