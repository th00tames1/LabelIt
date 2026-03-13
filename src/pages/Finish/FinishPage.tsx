import { useCallback, useEffect, useMemo, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { exportApi, finishApi, imageApi, projectApi } from '../../api/ipc'
import { useProjectStore } from '../../store/projectStore'
import { useI18n } from '../../i18n'
import { toLocalFileUrl } from '../../utils/paths'
import type {
  AugmentationRecipe,
  ContrastAdjustMode,
  DatasetVersion,
  ExportFormat,
  FinishImageIssue,
  FinishSummary,
  Image,
  ResizeMode,
  SplitType,
  VersionExportBatchResult,
} from '../../types'

interface Props {
  onBackToAnnotate: () => void
  onOpenImage: (imageId: string) => void
}

type FinishTab = 'overview' | 'dataset' | 'versions' | 'export'
type StatusFilter = 'all' | 'unlabeled' | 'labeled' | 'approved'
type DatasetIssueFilter = 'all' | 'ready' | FinishImageIssue['code']
type TechniqueKey = 'tiling' | 'auto_orient' | 'resize' | 'grayscale' | 'adjust_contrast' | 'flip' | 'rotate' | 'rotate_free' | 'shear' | 'brightness' | 'contrast' | 'saturation' | 'hue' | 'blur'

const STATUS_OPTIONS = ['unlabeled', 'labeled', 'approved'] as const
const SPLIT_OPTIONS = ['train', 'val', 'test', 'unassigned'] as const
const VISIBLE_ISSUES: FinishImageIssue['code'][] = ['missing_annotations', 'missing_labels', 'unassigned_split', 'status_unlabeled']

const DEFAULT_RECIPE: AugmentationRecipe = {
  tiling_enabled: false,
  tiling_grid: 2,
  auto_orient_enabled: true,
  isolate_objects_enabled: false,
  resize_enabled: true,
  resize_size: 640,
  resize_mode: 'black_edges',
  grayscale_enabled: false,
  adjust_contrast_enabled: false,
  adjust_contrast_mode: 'stretch',
  horizontal_flip_enabled: true,
  vertical_flip_enabled: false,
  rotate_cw90_enabled: true,
  rotate_cw270_enabled: true,
  rotate_enabled: false,
  rotate_range: 0,
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

function cloneRecipe(recipe: AugmentationRecipe): AugmentationRecipe {
  return { ...recipe }
}

function hasPreprocessingEffect(recipe: AugmentationRecipe): boolean {
  return recipe.tiling_enabled
    || recipe.auto_orient_enabled
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

function hasAnyRecipeEffect(recipe: AugmentationRecipe): boolean {
  return hasPreprocessingEffect(recipe) || hasAugmentationEffect(recipe)
}

function toMagnitudeLabel(value: number, digits = 2, suffix = ''): string {
  const magnitude = Math.abs(value).toFixed(digits)
  return `± ${magnitude}${suffix}`
}

function toPercentLabel(value: number, digits = 0): string {
  return `± ${(Math.abs(value) * 100).toFixed(digits)}%`
}

export default function FinishPage({ onBackToAnnotate, onOpenImage }: Props) {
  const project = useProjectStore((s) => s.currentProject)
  const { language, statusLabel, splitLabel } = useI18n()

  const [activeTab, setActiveTab] = useState<FinishTab>('overview')
  const [summary, setSummary] = useState<FinishSummary | null>(null)
  const [versions, setVersions] = useState<DatasetVersion[]>([])
  const [exampleImage, setExampleImage] = useState<Image | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedBlocker, setExpandedBlocker] = useState<FinishImageIssue['code'] | null>(null)
  const [activeTechnique, setActiveTechnique] = useState<TechniqueKey | null>(null)

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [splitFilter, setSplitFilter] = useState<'all' | SplitType>('all')
  const [issueFilter, setIssueFilter] = useState<DatasetIssueFilter>('all')

  const [editingVersionId, setEditingVersionId] = useState<string | null>(null)
  const [versionName, setVersionName] = useState('Augmented v1')
  const [multiplier, setMultiplier] = useState(3)
  const [recipe, setRecipe] = useState<AugmentationRecipe>(cloneRecipe(DEFAULT_RECIPE))
  const [savingVersion, setSavingVersion] = useState(false)
  const [versionMessage, setVersionMessage] = useState<string | null>(null)

  const [selectedExportIds, setSelectedExportIds] = useState<string[]>(['raw'])
  const [exportFormat, setExportFormat] = useState<ExportFormat>('yolo')
  const [exportSplit, setExportSplit] = useState<SplitType | 'all'>('all')
  const [includeImages, setIncludeImages] = useState(true)
  const [outputDir, setOutputDir] = useState('')
  const [isExporting, setIsExporting] = useState(false)
  const [exportResult, setExportResult] = useState<VersionExportBatchResult | null>(null)
  const [exportError, setExportError] = useState<string | null>(null)

  const text = language === 'ko'
    ? {
        title: '마무리 워크스페이스',
        subtitle: '라벨링 상태를 점검하고, 전처리/증강 버전을 만든 뒤 여러 형식으로 내보냅니다.',
        back: '← 라벨링',
        refresh: '새로고침',
        loading: '마무리 워크스페이스를 불러오는 중입니다...',
        failed: '마무리 워크스페이스를 불러오지 못했습니다.',
        tabs: {
          overview: '개요',
          dataset: '데이터셋',
          versions: '버전',
          export: '내보내기',
        },
        cards: {
          total: '전체 이미지',
          ready: '내보내기 가능',
          unlabeled: '미라벨',
          unassigned: '분할 미지정',
          missingLabels: '클래스 미지정',
        },
        blockers: '현재 해결할 항목',
        blockerHint: '문제를 누르면 해당 이미지 목록이 펼쳐지고, 이미지를 누르면 바로 이동합니다.',
        noBlockers: '지금 막히는 항목이 없습니다. 버전 생성과 내보내기를 진행해도 됩니다.',
        splitHealth: 'Split 구성',
        splitHealthHint: '현재 데이터셋이 train / val / test / unassigned에 어떻게 배치되어 있는지 보여줍니다.',
        filters: {
          search: '파일명 검색',
          status: '상태',
          split: '분할',
          issue: '문제',
          all: '전체',
          ready: '준비 완료',
        },
        issues: {
          missing_annotations: '어노테이션 없음',
          missing_labels: '클래스 미지정',
          status_unlabeled: '상태가 미라벨로 남아 있음',
          unassigned_split: '분할 미지정',
        },
        annotate: '열기',
        noImages: '현재 필터에 맞는 이미지가 없습니다.',
        versionBuilder: '버전 구성',
        versionName: '버전 이름',
        multiplier: '데이터 배수',
        trainOnlyHint: '증강은 train 이미지에만 적용되고, 전처리는 모든 split에 반영됩니다.',
        estimated: '예상 결과',
        preprocessingStep: '1단계 · 전처리',
        preprocessingHint: '입력 이미지를 먼저 정리하는 단계입니다.',
        augmentationStep: '2단계 · 증강',
        augmentationHint: '학습용 train 이미지 수를 늘리고 다양한 변형을 주는 단계입니다.',
        previewEmpty: '이미지를 업로드하면 여기에서 실제 미리보기를 볼 수 있습니다.',
        saveVersion: '버전 저장',
        updateVersion: '버전 업데이트',
        cancelEdit: '편집 취소',
        saved: '버전이 저장되었습니다. 내보내기 탭에서 바로 사용할 수 있습니다.',
        deleted: '버전이 삭제되었습니다.',
        exportTitle: '버전별 내보내기',
        exportHint: '여러 버전을 선택하면 지정한 폴더 아래에 버전별 결과가 각각 생성됩니다.',
        exportVersions: '내보내기 실행',
        browse: '폴더 선택',
        outputDir: '출력 폴더',
        exportFailed: '버전 내보내기에 실패했습니다.',
        exportDone: '내보내기가 완료되었습니다.',
        includeImages: '결과 폴더에 이미지 파일 포함',
        selectVersion: '내보낼 버전을 하나 이상 선택하세요.',
        selectOutput: '출력 폴더를 먼저 선택하세요.',
        rawTag: '원본',
        edit: '편집',
        delete: '삭제',
        on: '사용',
        off: '끄기',
        resizeMode: '비율 처리',
        resizeBlack: '검은 여백',
        resizeWhite: '흰 여백',
        resizeStretch: '늘이기',
        contrastStretch: '노출 보정',
        contrastEqualize: '히스토그램 평활화',
        exposure: '노출',
        rotate90: '시계 방향 90º',
        rotate270: '시계 방향 270º',
        exportImagesForced: '증강 버전은 생성 이미지가 필요하므로 이미지 포함 옵션이 자동으로 켜집니다.',
        formatDescriptions: {
          yolo: 'YOLO: YOLO 학습에 사용하는 TXT 어노테이션과 YAML 설정 파일',
          coco: 'COCO: EfficientDet PyTorch, Detectron2 등에 쓰는 JSON 어노테이션',
          voc: 'VOC: Pascal VOC XML 어노테이션 형식',
          csv: 'CSV: 분석이나 커스텀 파이프라인에 쓰기 쉬운 표 형식',
        },
      }
    : {
        title: 'Finish Workspace',
        subtitle: 'Review dataset health, build preprocessing and augmentation versions, then export multiple variants.',
        back: '← Annotate',
        refresh: 'Refresh',
        loading: 'Loading finish workspace...',
        failed: 'Failed to load the finish workspace.',
        tabs: {
          overview: 'Overview',
          dataset: 'Dataset',
          versions: 'Versions',
          export: 'Export',
        },
        cards: {
          total: 'Total Images',
          ready: 'Export Ready',
          unlabeled: 'Unlabeled',
          unassigned: 'Unassigned Split',
          missingLabels: 'Missing Classes',
        },
        blockers: 'Current blockers',
        blockerHint: 'Click a blocker to expand the affected images, then jump straight into annotation.',
        noBlockers: 'No major blockers found. You can move on to versioning and export.',
        splitHealth: 'Split health',
        splitHealthHint: 'Shows how the current dataset is distributed across train / val / test / unassigned.',
        filters: {
          search: 'Search filename',
          status: 'Status',
          split: 'Split',
          issue: 'Issue',
          all: 'All',
          ready: 'Ready',
        },
        issues: {
          missing_annotations: 'No annotations',
          missing_labels: 'Missing class labels',
          status_unlabeled: 'Still marked as unlabeled',
          unassigned_split: 'Split not assigned',
        },
        annotate: 'Open',
        noImages: 'No images match the current filters.',
        versionBuilder: 'Version Builder',
        versionName: 'Version Name',
        multiplier: 'Dataset Multiplier',
        trainOnlyHint: 'Augmentation applies to train only, while preprocessing affects every split.',
        estimated: 'Estimated result',
        preprocessingStep: 'Step 1 · Preprocessing',
        preprocessingHint: 'Clean and standardize the incoming images first.',
        augmentationStep: 'Step 2 · Augmentation',
        augmentationHint: 'Expand train images with randomized transformations.',
        previewEmpty: 'Import images to unlock live previews here.',
        saveVersion: 'Save Version',
        updateVersion: 'Update Version',
        cancelEdit: 'Cancel Edit',
        saved: 'Version saved. You can use it immediately in the Export tab.',
        deleted: 'Version deleted.',
        exportTitle: 'Version Export',
        exportHint: 'When multiple versions are selected, each version exports into its own folder inside the destination.',
        exportVersions: 'Export Versions',
        browse: 'Choose Folder',
        outputDir: 'Output Folder',
        exportFailed: 'Version export failed.',
        exportDone: 'Export completed.',
        includeImages: 'Include image files in the export output',
        selectVersion: 'Select at least one dataset version to export.',
        selectOutput: 'Choose an output folder first.',
        rawTag: 'Raw',
        edit: 'Edit',
        delete: 'Delete',
        on: 'On',
        off: 'Off',
        resizeMode: 'Aspect handling',
        resizeBlack: 'Black Edges',
        resizeWhite: 'White Edges',
        resizeStretch: 'Stretch',
        contrastStretch: 'Exposure Adjustment',
        contrastEqualize: 'Histogram Equalization',
        exposure: 'Exposure',
        rotate90: 'Clockwise 90º',
        rotate270: 'Clockwise 270º',
        exportImagesForced: 'Augmented versions need materialized generated images, so this stays enabled automatically.',
        formatDescriptions: {
          yolo: 'YOLO: TXT annotations and YAML config used with YOLO',
          coco: 'COCO: JSON annotations used with EfficientDet PyTorch and Detectron2',
          voc: 'VOC: Pascal VOC XML annotations for classic detection pipelines',
          csv: 'CSV: Tabular export for analysis and custom data pipelines',
        },
      }

  const previewImageUrl = exampleImage != null
    ? toLocalFileUrl(exampleImage.thumbnail_path ?? exampleImage.file_path)
    : ''

  const loadWorkspace = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [nextSummary, nextVersions, images] = await Promise.all([
        finishApi.getSummary(),
        finishApi.listVersions(),
        imageApi.list(),
      ])
      setSummary(nextSummary)
      setVersions(nextVersions)
      setExampleImage(images.find((image) => image.thumbnail_path != null) ?? images[0] ?? null)
    } catch (err) {
      setError(err instanceof Error ? err.message : text.failed)
    } finally {
      setLoading(false)
    }
  }, [text.failed])

  useEffect(() => {
    loadWorkspace().catch(console.error)
  }, [loadWorkspace])

  useEffect(() => {
    const validIds = new Set(versions.map((version) => version.id))
    setSelectedExportIds((current) => {
      const next = current.filter((id) => validIds.has(id))
      return next.length > 0 ? next : ['raw']
    })
  }, [versions])

  useEffect(() => {
    if (outputDir) return
    projectApi.getCurrentDir().then((dir) => {
      if (dir) setOutputDir(dir)
    }).catch(() => undefined)
  }, [outputDir])

  const filteredImages = useMemo(() => {
    const images = summary?.images ?? []
    const keyword = search.trim().toLowerCase()
    return images.filter((image) => {
      const matchesSearch = keyword.length === 0 || image.filename.toLowerCase().includes(keyword)
      const displayStatus = image.status === 'in_progress' ? 'labeled' : image.status
      const matchesStatus = statusFilter === 'all' || displayStatus === statusFilter
      const matchesSplit = splitFilter === 'all' || image.split === splitFilter
      const visibleIssues = image.issues.filter((issue) => VISIBLE_ISSUES.includes(issue.code))
      const matchesIssue = issueFilter === 'all'
        || (issueFilter === 'ready' ? visibleIssues.length === 0 : visibleIssues.some((issue) => issue.code === issueFilter))
      return matchesSearch && matchesStatus && matchesSplit && matchesIssue
    })
  }, [issueFilter, search, splitFilter, statusFilter, summary?.images])

  const blockerGroups = useMemo(() => {
    if (!summary) return []
    return VISIBLE_ISSUES.map((code) => ({
      code,
      label: text.issues[code],
      color: getIssueColor(code),
      items: summary.images.filter((image) => image.issues.some((issue) => issue.code === code)),
    })).filter((group) => group.items.length > 0)
  }, [summary, text.issues])

  const hasAugSelection = selectedExportIds.some((id) => versions.find((version) => version.id === id)?.kind === 'augmented')
  useEffect(() => {
    if (hasAugSelection && !includeImages) {
      setIncludeImages(true)
    }
  }, [hasAugSelection, includeImages])

  const trainCount = summary?.by_split.find((entry) => entry.split === 'train')?.total ?? 0
  const hasAugmentationsEnabled = hasAugmentationEffect(recipe)
  const effectiveMultiplier = hasAugmentationsEnabled ? multiplier : 1
  const estimatedTotal = summary ? summary.total_images - trainCount + (trainCount * effectiveMultiplier) : 0
  const canSaveVersion = versionName.trim().length > 0 && multiplier >= 2 && hasAnyRecipeEffect(recipe)

  const resetVersionForm = useCallback(() => {
    setEditingVersionId(null)
    setVersionName('Augmented v1')
    setMultiplier(3)
    setRecipe(cloneRecipe(DEFAULT_RECIPE))
    setVersionMessage(null)
  }, [])

  const updateRecipe = useCallback((patch: Partial<AugmentationRecipe>) => {
    setRecipe((current) => ({ ...current, ...patch }))
  }, [])

  const toggleField = (field: keyof AugmentationRecipe) => {
    updateRecipe({ [field]: !recipe[field] } as Partial<AugmentationRecipe>)
  }

  const setTechniqueEnabled = useCallback((technique: TechniqueKey, enabled: boolean) => {
    if (technique === 'tiling') updateRecipe({ tiling_enabled: enabled })
    else if (technique === 'auto_orient') updateRecipe({ auto_orient_enabled: enabled })
    else if (technique === 'resize') updateRecipe({ resize_enabled: enabled })
    else if (technique === 'grayscale') updateRecipe({ grayscale_enabled: enabled })
    else if (technique === 'adjust_contrast') updateRecipe({ adjust_contrast_enabled: enabled })
    else if (technique === 'flip') updateRecipe(enabled
      ? { horizontal_flip_enabled: true, vertical_flip_enabled: false }
      : { horizontal_flip_enabled: false, vertical_flip_enabled: false })
    else if (technique === 'rotate') updateRecipe(enabled
      ? { rotate_cw90_enabled: true }
      : { rotate_cw90_enabled: false, rotate_cw270_enabled: false })
    else if (technique === 'shear') updateRecipe(enabled
      ? { shear_enabled: true, shear_x_range: 10, shear_y_range: 10 }
      : { shear_enabled: false, shear_x_range: 0, shear_y_range: 0 })
    else if (technique === 'brightness') updateRecipe(enabled
      ? { brightness_enabled: true, brightness_range: 0.15 }
      : { brightness_enabled: false, brightness_range: 0 })
    else if (technique === 'contrast') updateRecipe(enabled
      ? { contrast_enabled: true, contrast_range: 0.1 }
      : { contrast_enabled: false, contrast_range: 0 })
    else if (technique === 'saturation') updateRecipe(enabled
      ? { saturation_enabled: true, saturation_range: 0.25 }
      : { saturation_enabled: false, saturation_range: 0 })
    else if (technique === 'hue') updateRecipe(enabled
      ? { hue_enabled: true, hue_range: 15 }
      : { hue_enabled: false, hue_range: 0 })
    else if (technique === 'blur') updateRecipe(enabled
      ? { blur_enabled: true, blur_range: 2.5 }
      : { blur_enabled: false, blur_range: 0 })
  }, [updateRecipe])

  const handleRange = (field: keyof AugmentationRecipe, max: number, value: number) => {
    const next = Math.max(0, Math.min(max, value))
    updateRecipe({ [field]: next } as Partial<AugmentationRecipe>)
  }

  const handleResizeSize = (raw: string) => {
    const parsed = Number(raw)
    if (!Number.isFinite(parsed)) return
    updateRecipe({ resize_size: Math.max(128, Math.min(4096, Math.round(parsed))) })
  }

  const handleTilingGrid = (raw: string) => {
    const parsed = Number(raw)
    if (!Number.isFinite(parsed)) return
    updateRecipe({ tiling_grid: Math.max(2, Math.min(8, Math.round(parsed))) })
  }

  const handleResizeMode = (mode: ResizeMode) => updateRecipe({ resize_mode: mode })
  const handleContrastMode = (mode: ContrastAdjustMode) => updateRecipe({ adjust_contrast_mode: mode })

  const handleSaveVersion = async () => {
    if (!canSaveVersion) return
    setSavingVersion(true)
    setVersionMessage(null)
    try {
      await finishApi.saveVersion({
        id: editingVersionId ?? undefined,
        name: versionName,
        preset: 'custom',
        multiplier,
        recipe,
      })
      await loadWorkspace()
      setVersionMessage(text.saved)
      resetVersionForm()
    } catch (err) {
      setVersionMessage(err instanceof Error ? err.message : text.failed)
    } finally {
      setSavingVersion(false)
    }
  }

  const handleEditVersion = (version: DatasetVersion) => {
    if (version.kind !== 'augmented' || version.recipe == null) return
    setActiveTab('versions')
    setEditingVersionId(version.id)
    setVersionName(version.name)
    setMultiplier(version.multiplier)
    setRecipe(cloneRecipe({ ...DEFAULT_RECIPE, ...version.recipe }))
    setVersionMessage(null)
  }

  const handleDeleteVersion = async (versionId: string) => {
    try {
      await finishApi.deleteVersion(versionId)
      await loadWorkspace()
      setSelectedExportIds((current) => current.filter((id) => id !== versionId))
      setVersionMessage(text.deleted)
      if (editingVersionId === versionId) resetVersionForm()
    } catch (err) {
      setVersionMessage(err instanceof Error ? err.message : text.failed)
    }
  }

  const handlePickOutputDir = async () => {
    const dir = await exportApi.showSaveDialog()
    if (dir) setOutputDir(dir)
  }

  const handleToggleExportVersion = (versionId: string) => {
    setSelectedExportIds((current) => current.includes(versionId)
      ? current.filter((id) => id !== versionId)
      : [...current, versionId])
  }

  const handleExport = async () => {
    if (selectedExportIds.length === 0) {
      setExportError(text.selectVersion)
      return
    }
    if (!outputDir) {
      setExportError(text.selectOutput)
      return
    }
    setIsExporting(true)
    setExportError(null)
    setExportResult(null)
    try {
      const result = await finishApi.exportVersions({
        version_ids: selectedExportIds,
        format: exportFormat,
        output_dir: outputDir,
        include_images: includeImages,
        split: exportSplit === 'all' ? undefined : exportSplit,
      })
      setExportResult(result)
    } catch (err) {
      setExportError(err instanceof Error ? err.message : text.exportFailed)
    } finally {
      setIsExporting(false)
    }
  }

  if (loading) {
    return <div style={loadingScreenStyle}>{text.loading}</div>
  }

  if (error || !summary) {
    return <div style={{ padding: 32, color: '#dc2626' }}>{error ?? text.failed}</div>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden', background: 'var(--bg-primary)' }}>
      <div style={finishHeaderStyle}>
          <button onClick={onBackToAnnotate} style={finishBackButtonStyle}>{text.back}</button>

        <div style={{ width: 1, height: 24, background: 'var(--border)', margin: '0 4px' }} />

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {project?.name}
          </span>
        </div>

        <div style={{ flex: 1 }} />

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button onClick={() => loadWorkspace().catch(console.error)} style={secondaryButtonStyle}>{text.refresh}</button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, padding: '10px 18px', borderBottom: '1px solid var(--border)', background: 'var(--bg-secondary)' }}>
        {(['overview', 'dataset', 'versions', 'export'] as FinishTab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              minWidth: 96,
              height: 30,
              padding: '4px 12px',
              borderRadius: 5,
              border: `1px solid ${activeTab === tab ? 'rgba(var(--accent-rgb),0.42)' : 'var(--border)'}`,
              background: activeTab === tab ? 'rgba(var(--accent-rgb),0.14)' : 'var(--bg-tertiary)',
              color: activeTab === tab ? 'var(--accent)' : 'var(--text-secondary)',
              fontSize: 12,
              fontWeight: 800,
            }}
          >
            {text.tabs[tab]}
          </button>
        ))}
      </div>

      <div style={{ flex: 1, minHeight: 0, padding: '18px', overflowY: 'auto' }}>
        {activeTab === 'overview' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div style={statGridStyle}>
              {[
                { label: text.cards.total, value: summary.total_images, color: 'var(--accent)' },
                { label: text.cards.ready, value: summary.ready_images, color: 'var(--success)' },
                { label: text.cards.unlabeled, value: summary.unlabeled_images, color: 'var(--status-unlabeled)' },
                { label: text.cards.unassigned, value: summary.unassigned_split_images, color: 'var(--split-unassigned)' },
                { label: text.cards.missingLabels, value: summary.missing_label_images, color: '#b45309' },
              ].map((card) => (
                <div key={card.label} style={statCardStyle}>
                  <div style={{ fontSize: 28, fontWeight: 800, color: card.color }}>{card.value}</div>
                  <div style={{ marginTop: 6, fontSize: 12, color: 'var(--text-secondary)' }}>{card.label}</div>
                </div>
              ))}
            </div>

            <div style={overviewGridStyle}>
              <div style={panelStyle}>
                <div style={panelTitleStyle}>{text.blockers}</div>
                {blockerGroups.length === 0 ? (
                  <div style={bodyTextStyle}>{text.noBlockers}</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div style={{ ...bodyTextStyle, fontSize: 12 }}>{text.blockerHint}</div>
                    {blockerGroups.map((group) => {
                      const expanded = expandedBlocker === group.code
                      return (
                        <div key={group.code} style={accordionStyle}>
                          <button
                            onClick={() => setExpandedBlocker(expanded ? null : group.code)}
                            style={{
                              width: '100%',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              padding: '12px 14px',
                              background: expanded ? 'rgba(var(--accent-rgb),0.12)' : 'transparent',
                              color: 'var(--text-primary)',
                              textAlign: 'left',
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              <span style={{ width: 10, height: 10, borderRadius: 999, background: group.color, flexShrink: 0 }} />
                              <span style={{ fontSize: 13, fontWeight: 700 }}>{group.label}</span>
                            </div>
                            <span style={{ fontSize: 12, fontWeight: 700, color: group.color }}>{group.items.length}</span>
                          </button>
                          {expanded && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '0 12px 12px' }}>
                              {group.items.map((image) => (
                                <button key={image.id} onClick={() => onOpenImage(image.id)} style={blockerImageButtonStyle}>
                                  <div style={{ minWidth: 0 }}>
                                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{image.filename}</div>
                                    <div style={{ marginTop: 5, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                      <Badge color={getStatusColor(toDisplayStatus(image.status))} label={statusLabel(toDisplayStatus(image.status))} subtle />
                                      <Badge color={getSplitColor(image.split)} label={splitLabel(image.split)} subtle />
                                    </div>
                                  </div>
                                  <span style={{ color: 'var(--accent)', fontSize: 12, fontWeight: 700 }}>{text.annotate}</span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              <div style={panelStyle}>
                <div style={panelTitleStyle}>{text.splitHealth}</div>
                <div style={{ ...bodyTextStyle, fontSize: 12, marginBottom: 14 }}>{text.splitHealthHint}</div>
                <SplitPieChart entries={summary.by_split} splitLabel={splitLabel} language={language} />
              </div>
            </div>
          </div>
        )}

        {activeTab === 'dataset' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: 10 }}>
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={text.filters.search} style={inputStyle} />
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as StatusFilter)} style={inputStyle}>
                <option value="all">{`${text.filters.status} · ${text.filters.all}`}</option>
                {STATUS_OPTIONS.map((status) => (
                  <option key={status} value={status}>{statusLabel(status)}</option>
                ))}
              </select>
              <select value={splitFilter} onChange={(e) => setSplitFilter(e.target.value as 'all' | SplitType)} style={inputStyle}>
                <option value="all">{`${text.filters.split} · ${text.filters.all}`}</option>
                {SPLIT_OPTIONS.map((split) => (
                  <option key={split} value={split}>{splitLabel(split)}</option>
                ))}
              </select>
              <select value={issueFilter} onChange={(e) => setIssueFilter(e.target.value as DatasetIssueFilter)} style={inputStyle}>
                <option value="all">{`${text.filters.issue} · ${text.filters.all}`}</option>
                <option value="ready">{text.filters.ready}</option>
                {VISIBLE_ISSUES.map((issue) => (
                  <option key={issue} value={issue}>{text.issues[issue]}</option>
                ))}
              </select>
            </div>

            <div style={{ ...panelStyle, padding: 0, overflow: 'hidden' }}>
              <div style={datasetHeaderStyle}>
                <div>{language === 'ko' ? '파일' : 'FILE'}</div>
                <div>{text.filters.status.toUpperCase()}</div>
                <div>{text.filters.split.toUpperCase()}</div>
                <div>{language === 'ko' ? '# 라벨' : '# Labels'}</div>
                <div>{language === 'ko' ? '문제' : 'ISSUES'}</div>
                <div />
              </div>
              {filteredImages.length === 0 ? (
                <div style={{ padding: 24, color: 'var(--text-muted)', textAlign: 'center' }}>{text.noImages}</div>
              ) : (
                filteredImages.map((image) => {
                  const visibleIssues = image.issues.filter((issue) => VISIBLE_ISSUES.includes(issue.code))
                  return (
                    <div key={image.id} style={datasetRowStyle}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{image.filename}</div>
                        <div style={{ marginTop: 4, fontSize: 11, color: visibleIssues.length === 0 ? 'var(--success)' : 'var(--text-muted)' }}>
                          {visibleIssues.length === 0 ? text.filters.ready : text.issues[visibleIssues[0].code]}
                        </div>
                      </div>
                      <div><Badge color={getStatusColor(toDisplayStatus(image.status))} label={statusLabel(toDisplayStatus(image.status))} /></div>
                      <div><Badge color={getSplitColor(image.split)} label={splitLabel(image.split)} /></div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>{image.annotation_count}</div>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {visibleIssues.length === 0
                          ? <Badge color="var(--success)" label={text.filters.ready} subtle />
                          : visibleIssues.map((issue) => <Badge key={issue.code} color={getIssueColor(issue.code)} label={text.issues[issue.code]} subtle />)}
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                        <button onClick={() => onOpenImage(image.id)} style={primaryGhostButtonStyle}>{text.annotate}</button>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        )}

        {activeTab === 'versions' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={panelStyle}>
              <div style={panelTitleStyle}>{text.versionBuilder}</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 0.8fr', gap: 12, marginBottom: 14 }}>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <span style={fieldLabelStyle}>{text.versionName}</span>
                  <input value={versionName} onChange={(e) => setVersionName(e.target.value)} style={inputStyle} />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <span style={fieldLabelStyle}>{text.multiplier}</span>
                  <div style={{ position: 'relative' }}>
                    <select value={multiplier} disabled={!hasAugmentationsEnabled} onChange={(e) => setMultiplier(Number(e.target.value))} style={{ ...inputStyle, appearance: 'none', paddingRight: 36, opacity: hasAugmentationsEnabled ? 1 : 0.6 }}>
                      {Array.from({ length: 9 }, (_, idx) => idx + 2).map((value) => (
                        <option key={value} value={value}>{`${value}x`}</option>
                      ))}
                    </select>
                    <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-primary)', fontSize: 13, pointerEvents: 'none' }}>▾</span>
                  </div>
                </label>
              </div>

              <div style={estimateCardStyle}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>{text.estimated}</div>
                <div style={{ marginTop: 8, display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 10, alignItems: 'center' }}>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                    {language === 'ko' ? `Train: ${trainCount}장` : `Training Set: ${trainCount} images`}
                  </div>
                  <div style={{ fontSize: 18, color: 'var(--accent)', fontWeight: 800 }}>→</div>
                  <div style={{ fontSize: 12, color: 'var(--text-primary)', lineHeight: 1.7, fontWeight: 700 }}>
                    {language === 'ko' ? `${trainCount * effectiveMultiplier}장` : `${trainCount * effectiveMultiplier} images`}
                  </div>
                </div>
                <div style={{ marginTop: 10, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.7 }}>{language === 'ko' ? `전체 예상: 약 ${estimatedTotal}장` : `Estimated total: about ${estimatedTotal} images`}</div>
                <div style={{ marginTop: 6, fontSize: 11, color: 'var(--text-muted)' }}>{text.trainOnlyHint}</div>
              </div>

              <div style={{ marginTop: 18 }}>
                <div style={stepTitleStyle}>{text.preprocessingStep}</div>
                <div style={bodyTextStyle}>{text.preprocessingHint}</div>
                <div style={techniqueGridStyle}>
                  <TechniqueSummaryCard title={language === 'ko' ? '자동 방향 보정' : 'Auto-Orient'} description={language === 'ko' ? 'EXIF 회전 정보를 정리해 방향을 표준화합니다.' : 'Discard EXIF rotations and standardize orientation.'} enabled={recipe.auto_orient_enabled} summary={language === 'ko' ? '기본 방향 정리' : 'Normalize orientation'} onToggle={(enabled) => setTechniqueEnabled('auto_orient', enabled)} onClick={() => setActiveTechnique('auto_orient')} />
                  <TechniqueSummaryCard title={language === 'ko' ? '리사이즈' : 'Resize'} description={language === 'ko' ? '정사각형 크기와 여백 처리 방식을 지정합니다.' : 'Set target square size and aspect handling.'} enabled={recipe.resize_enabled} summary={`${recipe.resize_size}x${recipe.resize_size} · ${recipe.resize_mode === 'black_edges' ? text.resizeBlack : recipe.resize_mode === 'white_edges' ? text.resizeWhite : text.resizeStretch}`} onToggle={(enabled) => setTechniqueEnabled('resize', enabled)} onClick={() => setActiveTechnique('resize')} />
                  <TechniqueSummaryCard title={language === 'ko' ? '타일링' : 'Tiling'} description={language === 'ko' ? '이미지 픽셀 크기를 기준으로 타일을 나눕니다.' : 'Split the full image into pixel-based tiles.'} enabled={recipe.tiling_enabled} summary={`${recipe.tiling_grid}x${recipe.tiling_grid}`} onToggle={(enabled) => setTechniqueEnabled('tiling', enabled)} onClick={() => setActiveTechnique('tiling')} />
                  <TechniqueSummaryCard title={language === 'ko' ? '대비 보정' : 'Adjust Contrast'} description={language === 'ko' ? '전처리 단계에서 대비를 자동 보정합니다.' : 'Apply preprocessing-time contrast enhancement.'} enabled={recipe.adjust_contrast_enabled} summary={recipe.adjust_contrast_mode === 'equalize' ? text.contrastEqualize : text.contrastStretch} onToggle={(enabled) => setTechniqueEnabled('adjust_contrast', enabled)} onClick={() => setActiveTechnique('adjust_contrast')} />
                  <TechniqueSummaryCard title={language === 'ko' ? '흑백 변환' : 'Grayscale'} description={language === 'ko' ? '색 정보를 제거하고 명암 중심으로 만듭니다.' : 'Convert the image to grayscale.'} enabled={recipe.grayscale_enabled} summary={language === 'ko' ? '흑백 처리' : 'Monochrome'} onToggle={(enabled) => setTechniqueEnabled('grayscale', enabled)} onClick={() => setActiveTechnique('grayscale')} />
                </div>
              </div>

              <div style={{ marginTop: 20 }}>
                <div style={stepTitleStyle}>{text.augmentationStep}</div>
                <div style={bodyTextStyle}>{text.augmentationHint}</div>
                <div style={techniqueGridStyle}>
                  <TechniqueSummaryCard
                    title={language === 'ko' ? '반전' : 'Flip'}
                    description={language === 'ko' ? '좌우/상하 반전을 한 카드에서 설정합니다.' : 'Configure horizontal and vertical flips in one place.'}
                    enabled={recipe.horizontal_flip_enabled || recipe.vertical_flip_enabled}
                    summary={`${recipe.horizontal_flip_enabled ? 'H' : '-'} / ${recipe.vertical_flip_enabled ? 'V' : '-'}`}
                    onToggle={(enabled) => setTechniqueEnabled('flip', enabled)}
                    onClick={() => setActiveTechnique('flip')}
                  />
                  <TechniqueSummaryCard
                    title={language === 'ko' ? '90º 회전' : 'Rotate 90º'}
                    description={language === 'ko' ? '시계 방향 90º, 270º 회전을 선택합니다.' : 'Enable clockwise 90º and 270º rotations.'}
                    enabled={recipe.rotate_cw90_enabled || recipe.rotate_cw270_enabled}
                    summary={`${recipe.rotate_cw90_enabled ? '90º' : '-'} / ${recipe.rotate_cw270_enabled ? '270º' : '-'}`}
                    onToggle={(enabled) => setTechniqueEnabled('rotate', enabled)}
                    onClick={() => setActiveTechnique('rotate')}
                  />
                  <TechniqueSummaryCard
                    title={language === 'ko' ? '회전' : 'Rotate'}
                    description={language === 'ko' ? '0부터 ±15º까지 자유 회전을 설정합니다.' : 'Set free rotation from 0 to ±15º.'}
                    enabled={recipe.rotate_enabled}
                    summary={toMagnitudeLabel(recipe.rotate_range, 0, 'º')}
                    onToggle={(enabled) => updateRecipe(enabled ? { rotate_enabled: true, rotate_range: 15 } : { rotate_enabled: false, rotate_range: 0 })}
                    onClick={() => setActiveTechnique('rotate_free')}
                  />
                  <TechniqueSummaryCard
                    title={language === 'ko' ? '기울이기' : 'Shear'}
                    description={language === 'ko' ? '0에서 시작해 최대 30º까지 기울이기 강도를 설정합니다.' : 'Set shear strength from 0 up to 30º.'}
                    enabled={recipe.shear_enabled}
                    summary={`H ${toMagnitudeLabel(recipe.shear_x_range, 0, 'º')} / V ${toMagnitudeLabel(recipe.shear_y_range, 0, 'º')}`}
                    onToggle={(enabled) => setTechniqueEnabled('shear', enabled)}
                    onClick={() => setActiveTechnique('shear')}
                  />
                  <TechniqueSummaryCard
                    title={language === 'ko' ? '밝기' : 'Brightness'}
                    description={language === 'ko' ? '0에서 시작해 최대 30%까지 밝기 범위를 설정합니다.' : 'Set brightness range from 0 up to 30%.'}
                    enabled={recipe.brightness_enabled}
                    summary={toPercentLabel(recipe.brightness_range, 0)}
                    onToggle={(enabled) => setTechniqueEnabled('brightness', enabled)}
                    onClick={() => setActiveTechnique('brightness')}
                  />
                  <TechniqueSummaryCard
                    title={language === 'ko' ? '노출' : 'Exposure'}
                    description={language === 'ko' ? '0에서 시작해 최대 30%까지 노출 범위를 설정합니다.' : 'Set exposure range from 0 up to 30%.'}
                    enabled={recipe.contrast_enabled}
                    summary={toPercentLabel(recipe.contrast_range, 0)}
                    onToggle={(enabled) => setTechniqueEnabled('contrast', enabled)}
                    onClick={() => setActiveTechnique('contrast')}
                  />
                  <TechniqueSummaryCard
                    title={language === 'ko' ? '채도' : 'Saturation'}
                    description={language === 'ko' ? '0에서 시작해 최대 30%까지 채도 범위를 설정합니다.' : 'Set saturation range from 0 up to 30%.'}
                    enabled={recipe.saturation_enabled}
                    summary={toPercentLabel(recipe.saturation_range, 0)}
                    onToggle={(enabled) => setTechniqueEnabled('saturation', enabled)}
                    onClick={() => setActiveTechnique('saturation')}
                  />
                  <TechniqueSummaryCard
                    title={language === 'ko' ? '색조' : 'Hue'}
                    description={language === 'ko' ? '0에서 시작해 최대 30º까지 색조 범위를 설정합니다.' : 'Set hue range from 0 up to 30º.'}
                    enabled={recipe.hue_enabled}
                    summary={toMagnitudeLabel(recipe.hue_range, 0, 'º')}
                    onToggle={(enabled) => setTechniqueEnabled('hue', enabled)}
                    onClick={() => setActiveTechnique('hue')}
                  />
                  <TechniqueSummaryCard
                    title={language === 'ko' ? '블러' : 'Blur'}
                    description={language === 'ko' ? '0에서 시작해 최대 30%까지 블러 강도를 설정합니다.' : 'Set blur strength from 0 up to 30%.'}
                    enabled={recipe.blur_enabled}
                    summary={`${recipe.blur_range.toFixed(1)}px`}
                    onToggle={(enabled) => setTechniqueEnabled('blur', enabled)}
                    onClick={() => setActiveTechnique('blur')}
                  />
                </div>
              </div>

              {versionMessage && (
                <div style={{ marginTop: 16, fontSize: 12, color: versionMessage === text.saved || versionMessage === text.deleted ? 'var(--success)' : '#dc2626' }}>
                  {versionMessage}
                </div>
              )}

              <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
                <button onClick={handleSaveVersion} disabled={!canSaveVersion || savingVersion} style={primaryButtonWideStyle}>
                  {editingVersionId ? text.updateVersion : text.saveVersion}
                </button>
                {editingVersionId && (
                  <button onClick={resetVersionForm} style={secondaryButtonWideStyle}>{text.cancelEdit}</button>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'export' && (
          <div style={{ display: 'grid', gridTemplateColumns: '0.9fr 1.1fr', gap: 16 }}>
            <div style={panelStyle}>
              <div style={panelTitleStyle}>{text.exportTitle}</div>
              <div style={bodyTextStyle}>{text.exportHint}</div>

              <div style={{ marginTop: 16 }}>
                <div style={fieldLabelStyle}>{language === 'ko' ? '형식' : 'FORMAT'}</div>
                <div style={formatGridStyle}>
                  {(['yolo', 'coco', 'voc', 'csv'] as ExportFormat[]).map((format) => (
                    <button key={format} onClick={() => setExportFormat(format)} style={{ ...formatButtonStyle, ...(exportFormat === format ? activeFormatButtonStyle : {}) }}>
                      {format.toUpperCase()}
                    </button>
                  ))}
                </div>
                <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                  {text.formatDescriptions[exportFormat]}
                </div>
              </div>

              <div style={{ marginTop: 16 }}>
                <div style={fieldLabelStyle}>{language === 'ko' ? '분할' : 'SPLIT'}</div>
                <div style={formatGridStyle}>
                  {(['all', 'train', 'val', 'test'] as const).map((split) => (
                    <button key={split} onClick={() => setExportSplit(split)} style={{ ...formatButtonStyle, ...(exportSplit === split ? activeFormatButtonStyle : {}) }}>
                      {split === 'all' ? text.filters.all : splitLabel(split)}
                    </button>
                  ))}
                </div>
              </div>

              <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 18, fontSize: 13, color: 'var(--text-primary)' }}>
                <input type="checkbox" checked={includeImages} disabled={hasAugSelection} onChange={(e) => setIncludeImages(e.target.checked)} />
                {text.includeImages}
              </label>
              {hasAugSelection && (
                <div style={{ marginTop: 6, fontSize: 11, color: 'var(--text-muted)' }}>{text.exportImagesForced}</div>
              )}

              <div style={{ marginTop: 18 }}>
                <div style={fieldLabelStyle}>{text.outputDir}</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <div style={{ ...inputStyle, flex: 1, display: 'flex', alignItems: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {outputDir || text.outputDir}
                  </div>
                  <button onClick={handlePickOutputDir} style={secondaryButtonStyle}>{text.browse}</button>
                </div>
              </div>

              {exportError && <div style={{ marginTop: 14, fontSize: 12, color: '#dc2626' }}>{exportError}</div>}
              {exportResult && <div style={{ marginTop: 14, fontSize: 12, color: 'var(--success)' }}>{text.exportDone}</div>}

              <div style={{ marginTop: 18 }}>
                <button onClick={handleExport} disabled={isExporting} style={primaryButtonWideStyle}>
                  {isExporting ? `${text.exportVersions}...` : text.exportVersions}
                </button>
              </div>
            </div>

            <div style={panelStyle}>
              <div style={panelTitleStyle}>{text.exportTitle}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {versions.map((version) => (
                  <div key={version.id} style={{ padding: '12px 12px', borderRadius: 12, background: selectedExportIds.includes(version.id) ? 'rgba(var(--accent-rgb),0.12)' : 'var(--bg-tertiary)', border: `1px solid ${selectedExportIds.includes(version.id) ? 'rgba(var(--accent-rgb),0.38)' : 'var(--border)'}` }}>
                    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                      <input type="checkbox" checked={selectedExportIds.includes(version.id)} onChange={() => handleToggleExportVersion(version.id)} style={{ marginTop: 2 }} />
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{version.name}</span>
                          <Badge color={version.kind === 'raw' ? '#64748b' : 'var(--accent)'} label={version.kind === 'raw' ? text.rawTag : `${version.multiplier}x`} subtle />
                        </div>
                        <div style={{ marginTop: 6, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                          {version.kind === 'raw'
                            ? (language === 'ko' ? '원본 그대로 내보냅니다.' : 'Exports the dataset without version processing.')
                            : summarizeRecipe(version.recipe, language)}
                        </div>
                      </div>
                      {version.kind === 'augmented' && (
                        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                          <button onClick={() => handleEditVersion(version)} style={secondaryButtonStyle}>{text.edit}</button>
                          <button onClick={() => handleDeleteVersion(version.id)} style={dangerButtonStyle}>{text.delete}</button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {exportResult && (
                <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {exportResult.results.map((result) => (
                    <div key={result.version_id} style={exportResultCardStyle}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{result.version_name}</div>
                      <div style={{ marginTop: 4, fontSize: 12, color: 'var(--text-secondary)' }}>{`${result.file_count} files · ${result.annotation_count} annotations`}</div>
                      <div style={{ marginTop: 6, fontSize: 11, color: 'var(--text-muted)', wordBreak: 'break-all' }}>{result.output_path}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {activeTechnique != null && (
        <TechniqueModal
          technique={activeTechnique}
          onClose={() => setActiveTechnique(null)}
          recipe={recipe}
          language={language}
          previewImageUrl={previewImageUrl}
          previewImageSize={exampleImage != null ? { width: exampleImage.width, height: exampleImage.height } : null}
          previewLabel={exampleImage?.filename ?? ''}
          emptyText={text.previewEmpty}
          resizeModeText={text}
          onToggleField={toggleField}
          onUpdateRecipe={updateRecipe}
          onHandleResizeSize={handleResizeSize}
          onHandleTilingGrid={handleTilingGrid}
          onHandleResizeMode={handleResizeMode}
          onHandleContrastMode={handleContrastMode}
          onHandleRange={handleRange}
          rotateText={{ cw90: text.rotate90, cw270: text.rotate270 }}
        />
      )}
    </div>
  )
}

function SplitPieChart({ entries, splitLabel, language }: { entries: FinishSummary['by_split']; splitLabel: (split: SplitType) => string; language: 'en' | 'ko' }) {
  const total = entries.reduce((sum, entry) => sum + entry.total, 0)
  const safeTotal = total === 0 ? 1 : total
  let offset = 0
  const segments = entries.map((entry) => {
    const start = (offset / safeTotal) * 100
    offset += entry.total
    const end = (offset / safeTotal) * 100
    return `${getSplitColor(entry.split)} ${start}% ${end}%`
  })

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 18, alignItems: 'center' }}>
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <div style={{ position: 'relative', width: 190, height: 190 }}>
          <div style={{ width: '100%', height: '100%', borderRadius: '50%', background: `conic-gradient(${segments.join(', ')})`, border: '1px solid var(--border)' }} />
          <div style={{ position: 'absolute', inset: 26, borderRadius: '50%', background: 'var(--bg-secondary)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
            <div>
              <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--text-primary)' }}>{total}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', letterSpacing: '0.08em' }}>{language === 'ko' ? '전체' : 'TOTAL'}</div>
            </div>
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {entries.map((entry) => {
          const percent = total === 0 ? 0 : (entry.total / total) * 100
          return (
            <div key={entry.split} style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 10, alignItems: 'center', padding: '10px 12px', borderRadius: 12, background: 'var(--bg-tertiary)', border: '1px solid var(--border)' }}>
              <span style={{ width: 10, height: 10, borderRadius: 999, background: getSplitColor(entry.split) }} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{splitLabel(entry.split)}</span>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{language === 'ko' ? `준비 완료 ${entry.ready}` : `${entry.ready} ready`}</span>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: getSplitColor(entry.split) }}>{percent.toFixed(0)}%</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{entry.total}</div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function TechniqueSummaryCard({
  title,
  description,
  enabled,
  summary,
  onToggle,
  onClick,
}: {
  title: string
  description: string
  enabled: boolean
  summary: string
  onToggle: (enabled: boolean) => void
  onClick: () => void
}) {
  return (
    <button onClick={onClick} style={{ ...techniqueSummaryCardStyle, opacity: enabled ? 1 : 0.82 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
        <div style={{ textAlign: 'left', flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-primary)' }}>{title}</div>
          <div style={{ marginTop: 4, fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.55 }}>{description}</div>
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation()
            onToggle(!enabled)
          }}
          style={{
            minWidth: 58,
            height: 28,
            padding: '0 10px',
            borderRadius: 999,
            border: `1px solid ${enabled ? 'rgba(var(--accent-rgb),0.36)' : 'var(--border)'}`,
            background: enabled ? 'rgba(var(--accent-rgb),0.14)' : 'var(--bg-secondary)',
            color: enabled ? 'var(--accent)' : 'var(--text-muted)',
            fontSize: 11,
            fontWeight: 800,
          }}
        >
          {enabled ? 'ON' : 'OFF'}
        </button>
      </div>
      <div style={{ marginTop: 10, fontSize: 11, color: 'var(--text-muted)', textAlign: 'left' }}>{summary}</div>
    </button>
  )
}

function TechniqueModal({
  technique,
  onClose,
  recipe,
  language,
  previewImageUrl,
  previewImageSize,
  previewLabel,
  emptyText,
  resizeModeText,
  onToggleField,
  onUpdateRecipe,
  onHandleResizeSize,
  onHandleTilingGrid,
  onHandleResizeMode,
  onHandleContrastMode,
  onHandleRange,
  rotateText,
}: {
  technique: TechniqueKey
  onClose: () => void
  recipe: AugmentationRecipe
  language: 'en' | 'ko'
  previewImageUrl: string
  previewImageSize: { width: number; height: number } | null
  previewLabel: string
  emptyText: string
  resizeModeText: {
    resizeMode: string
    resizeBlack: string
    resizeWhite: string
    resizeStretch: string
    contrastStretch: string
    contrastEqualize: string
  }
  onToggleField: (field: keyof AugmentationRecipe) => void
  onUpdateRecipe: (patch: Partial<AugmentationRecipe>) => void
  onHandleResizeSize: (raw: string) => void
  onHandleTilingGrid: (raw: string) => void
  onHandleResizeMode: (mode: ResizeMode) => void
  onHandleContrastMode: (mode: ContrastAdjustMode) => void
  onHandleRange: (field: keyof AugmentationRecipe, max: number, value: number) => void
  rotateText: { cw90: string; cw270: string }
}) {
  const contentMap: Record<TechniqueKey, { title: string; description: string; kind: string }> = {
    tiling: {
      title: language === 'ko' ? '타일링' : 'Tiling',
      description: language === 'ko' ? '이미지 픽셀 크기를 기준으로 N x N 타일로 나눕니다.' : 'Split the full image into N x N pixel-based tiles.',
      kind: 'tiling',
    },
    auto_orient: {
      title: language === 'ko' ? '자동 방향 보정' : 'Auto-Orient',
      description: language === 'ko' ? 'EXIF 회전 정보를 정리해 방향을 표준화합니다.' : 'Discard EXIF rotations and standardize orientation.',
      kind: 'auto_orient',
    },
    resize: {
      title: language === 'ko' ? '리사이즈' : 'Resize',
      description: language === 'ko' ? '정사각형 크기와 비율 처리 방식을 지정합니다.' : 'Set the square size and aspect handling mode.',
      kind: 'resize',
    },
    grayscale: {
      title: language === 'ko' ? '흑백 변환' : 'Grayscale',
      description: language === 'ko' ? '색 정보를 제거하고 명암 중심으로 변환합니다.' : 'Convert the full image to grayscale.',
      kind: 'grayscale',
    },
    adjust_contrast: {
      title: language === 'ko' ? '대비 보정' : 'Adjust Contrast',
      description: language === 'ko' ? '전처리 단계에서 대비를 자동 보정합니다.' : 'Apply preprocessing-time contrast enhancement.',
      kind: 'adjust_contrast',
    },
    flip: {
      title: language === 'ko' ? '반전' : 'Flip',
      description: language === 'ko' ? '좌우 반전과 상하 반전을 한 곳에서 설정합니다.' : 'Configure horizontal and vertical flips together.',
      kind: recipe.horizontal_flip_enabled ? 'horizontal_flip' : 'vertical_flip',
    },
    rotate: {
      title: language === 'ko' ? '90º 회전' : 'Rotate 90º',
      description: language === 'ko' ? '시계 방향 90º, 270º 회전을 선택합니다.' : 'Enable clockwise 90º and 270º rotations.',
      kind: 'rotate',
    },
    rotate_free: {
      title: language === 'ko' ? '회전' : 'Rotate',
      description: language === 'ko' ? '0부터 ±15º까지 자유 회전을 설정합니다.' : 'Set free rotation from 0 to ±15º.',
      kind: 'rotate_free',
    },
    shear: {
      title: language === 'ko' ? '기울이기' : 'Shear',
      description: language === 'ko' ? '0에서 시작해 최대 30º까지 기울이기 강도를 설정합니다.' : 'Set shear strength from 0 up to 30º.',
      kind: 'shear',
    },
    brightness: {
      title: language === 'ko' ? '밝기' : 'Brightness',
      description: language === 'ko' ? '0에서 시작해 최대 30%까지 밝기 범위를 설정합니다.' : 'Set brightness range from 0 up to 30%.',
      kind: 'brightness',
    },
    contrast: {
      title: language === 'ko' ? '노출' : 'Exposure',
      description: language === 'ko' ? '0에서 시작해 최대 30%까지 노출 범위를 설정합니다.' : 'Set exposure range from 0 up to 30%.',
      kind: 'contrast',
    },
    saturation: {
      title: language === 'ko' ? '채도' : 'Saturation',
      description: language === 'ko' ? '0에서 시작해 최대 30%까지 채도 범위를 설정합니다.' : 'Set saturation range from 0 up to 30%.',
      kind: 'saturation',
    },
    hue: {
      title: language === 'ko' ? '색조' : 'Hue',
      description: language === 'ko' ? '0에서 시작해 최대 30º까지 색조 범위를 설정합니다.' : 'Set hue range from 0 up to 30º.',
      kind: 'hue',
    },
    blur: {
      title: language === 'ko' ? '블러' : 'Blur',
      description: language === 'ko' ? '0에서 시작해 최대 30%까지 블러 강도를 설정합니다.' : 'Set blur strength from 0 up to 30%.',
      kind: 'blur',
    },
  }

  const content = contentMap[technique]

  return (
    <div style={techniqueModalOverlayStyle} onClick={onClose}>
      <div style={techniqueModalStyle} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: 12, marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-primary)' }}>{content.title}</div>
            <div style={{ marginTop: 6, ...bodyTextStyle }}>{content.description}</div>
          </div>
          <button onClick={onClose} style={modalCloseButtonStyle}>×</button>
        </div>

        <div style={techniqueModalPreviewStyle}>{buildPreview(content.kind, recipe, previewImageUrl, previewImageSize, previewLabel, emptyText)}</div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 16 }}>
          {technique === 'tiling' && (
            <>
              <label style={modalCheckRowStyle}>
                <input type="checkbox" checked={recipe.tiling_enabled} onChange={() => onToggleField('tiling_enabled')} />
                <span>{language === 'ko' ? '타일링 사용' : 'Enable tiling'}</span>
              </label>
              <div style={dualInputRowCompactStyle}>
                <input type="number" min={2} max={8} value={recipe.tiling_grid} disabled={!recipe.tiling_enabled} onChange={(e) => onHandleTilingGrid(e.target.value)} style={inputStyle} />
                <div style={resizeTimesStyle}>x</div>
                <input type="number" min={2} max={8} value={recipe.tiling_grid} disabled={!recipe.tiling_enabled} onChange={(e) => onHandleTilingGrid(e.target.value)} style={inputStyle} />
              </div>
            </>
          )}

          {technique === 'auto_orient' && (
            <label style={modalCheckRowStyle}>
              <input type="checkbox" checked={recipe.auto_orient_enabled} onChange={() => onToggleField('auto_orient_enabled')} />
              <span>{language === 'ko' ? '자동 방향 보정 사용' : 'Enable auto-orient'}</span>
            </label>
          )}

          {technique === 'resize' && (
            <>
              <label style={modalCheckRowStyle}>
                <input type="checkbox" checked={recipe.resize_enabled} onChange={() => onToggleField('resize_enabled')} />
                <span>{language === 'ko' ? '리사이즈 사용' : 'Enable resize'}</span>
              </label>
              <div style={dualInputRowCompactStyle}>
                <input type="number" value={recipe.resize_size} disabled={!recipe.resize_enabled} onChange={(e) => onHandleResizeSize(e.target.value)} style={inputStyle} />
                <div style={resizeTimesStyle}>x</div>
                <input type="number" value={recipe.resize_size} disabled={!recipe.resize_enabled} onChange={(e) => onHandleResizeSize(e.target.value)} style={inputStyle} />
              </div>
              <OptionChips
                label={resizeModeText.resizeMode}
                value={recipe.resize_mode}
                disabled={!recipe.resize_enabled}
                options={[
                  { value: 'black_edges', label: resizeModeText.resizeBlack },
                  { value: 'white_edges', label: resizeModeText.resizeWhite },
                  { value: 'stretch', label: resizeModeText.resizeStretch },
                ]}
                onChange={(value) => onHandleResizeMode(value as ResizeMode)}
              />
            </>
          )}

          {technique === 'grayscale' && (
            <label style={modalCheckRowStyle}>
              <input type="checkbox" checked={recipe.grayscale_enabled} onChange={() => onToggleField('grayscale_enabled')} />
              <span>{language === 'ko' ? '흑백 변환 사용' : 'Enable grayscale'}</span>
            </label>
          )}

          {technique === 'adjust_contrast' && (
            <>
              <label style={modalCheckRowStyle}>
                <input type="checkbox" checked={recipe.adjust_contrast_enabled} onChange={() => onToggleField('adjust_contrast_enabled')} />
                <span>{language === 'ko' ? '대비 보정 사용' : 'Enable contrast adjustment'}</span>
              </label>
              <OptionChips
                label={language === 'ko' ? '방식' : 'MODE'}
                value={recipe.adjust_contrast_mode}
                disabled={!recipe.adjust_contrast_enabled}
                options={[
                  { value: 'stretch', label: resizeModeText.contrastStretch },
                  { value: 'equalize', label: resizeModeText.contrastEqualize },
                ]}
                onChange={(value) => onHandleContrastMode(value as ContrastAdjustMode)}
              />
            </>
          )}

          {technique === 'flip' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <SubCheck label={language === 'ko' ? '좌우 반전' : 'Horizontal Flip'} checked={recipe.horizontal_flip_enabled} disabled={false} onChange={(checked) => onUpdateRecipe({ horizontal_flip_enabled: checked })} />
              <SubCheck label={language === 'ko' ? '상하 반전' : 'Vertical Flip'} checked={recipe.vertical_flip_enabled} disabled={false} onChange={(checked) => onUpdateRecipe({ vertical_flip_enabled: checked })} />
            </div>
          )}

          {technique === 'rotate' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <SubCheck label={rotateText.cw90} checked={recipe.rotate_cw90_enabled} disabled={false} onChange={(checked) => onUpdateRecipe({ rotate_cw90_enabled: checked })} />
              <SubCheck label={rotateText.cw270} checked={recipe.rotate_cw270_enabled} disabled={false} onChange={(checked) => onUpdateRecipe({ rotate_cw270_enabled: checked })} />
            </div>
          )}

          {technique === 'shear' && (
            <>
              <label style={modalCheckRowStyle}>
                <input type="checkbox" checked={recipe.shear_enabled} onChange={() => onToggleField('shear_enabled')} />
                <span>{language === 'ko' ? '기울이기 사용' : 'Enable shear'}</span>
              </label>
              <RangeSlider label={language === 'ko' ? '가로' : 'Horizontal'} value={recipe.shear_x_range} max={15} step={1} disabled={!recipe.shear_enabled} display={toMagnitudeLabel(recipe.shear_x_range, 0, 'º')} onChange={(value) => onHandleRange('shear_x_range', 15, value)} />
              <RangeSlider label={language === 'ko' ? '세로' : 'Vertical'} value={recipe.shear_y_range} max={15} step={1} disabled={!recipe.shear_enabled} display={toMagnitudeLabel(recipe.shear_y_range, 0, 'º')} onChange={(value) => onHandleRange('shear_y_range', 15, value)} />
            </>
          )}

          {technique === 'rotate_free' && (
            <>
              <label style={modalCheckRowStyle}>
                <input type="checkbox" checked={recipe.rotate_enabled} onChange={() => onToggleField('rotate_enabled')} />
                <span>{language === 'ko' ? '회전 사용' : 'Enable rotation'}</span>
              </label>
              <RangeSlider label={language === 'ko' ? '범위' : 'RANGE'} value={recipe.rotate_range} max={15} step={1} disabled={!recipe.rotate_enabled} display={toMagnitudeLabel(recipe.rotate_range, 0, 'º')} onChange={(value) => onHandleRange('rotate_range', 15, value)} />
            </>
          )}

          {technique === 'brightness' && (
            <>
              <label style={modalCheckRowStyle}>
                <input type="checkbox" checked={recipe.brightness_enabled} onChange={() => onToggleField('brightness_enabled')} />
                <span>{language === 'ko' ? '밝기 사용' : 'Enable brightness'}</span>
              </label>
              <RangeSlider label={language === 'ko' ? '범위' : 'RANGE'} value={recipe.brightness_range} max={0.3} step={0.01} disabled={!recipe.brightness_enabled} display={toPercentLabel(recipe.brightness_range, 0)} onChange={(value) => onHandleRange('brightness_range', 0.3, value)} />
            </>
          )}

          {technique === 'contrast' && (
            <>
              <label style={modalCheckRowStyle}>
                <input type="checkbox" checked={recipe.contrast_enabled} onChange={() => onToggleField('contrast_enabled')} />
                <span>{language === 'ko' ? '노출 사용' : 'Enable exposure'}</span>
              </label>
              <RangeSlider label={language === 'ko' ? '범위' : 'RANGE'} value={recipe.contrast_range} max={0.3} step={0.01} disabled={!recipe.contrast_enabled} display={toPercentLabel(recipe.contrast_range, 0)} onChange={(value) => onHandleRange('contrast_range', 0.3, value)} />
            </>
          )}

          {technique === 'saturation' && (
            <>
              <label style={modalCheckRowStyle}>
                <input type="checkbox" checked={recipe.saturation_enabled} onChange={() => onToggleField('saturation_enabled')} />
                <span>{language === 'ko' ? '채도 사용' : 'Enable saturation'}</span>
              </label>
              <RangeSlider label={language === 'ko' ? '범위' : 'RANGE'} value={recipe.saturation_range} max={0.3} step={0.01} disabled={!recipe.saturation_enabled} display={toPercentLabel(recipe.saturation_range, 0)} onChange={(value) => onHandleRange('saturation_range', 0.3, value)} />
            </>
          )}

          {technique === 'hue' && (
            <>
              <label style={modalCheckRowStyle}>
                <input type="checkbox" checked={recipe.hue_enabled} onChange={() => onToggleField('hue_enabled')} />
                <span>{language === 'ko' ? '색조 사용' : 'Enable hue'}</span>
              </label>
              <RangeSlider label={language === 'ko' ? '범위' : 'RANGE'} value={recipe.hue_range} max={30} step={1} disabled={!recipe.hue_enabled} display={toMagnitudeLabel(recipe.hue_range, 0, 'º')} onChange={(value) => onHandleRange('hue_range', 30, value)} />
            </>
          )}

          {technique === 'blur' && (
            <>
              <label style={modalCheckRowStyle}>
                <input type="checkbox" checked={recipe.blur_enabled} onChange={() => onToggleField('blur_enabled')} />
                <span>{language === 'ko' ? '블러 사용' : 'Enable blur'}</span>
              </label>
              <RangeSlider label={language === 'ko' ? '범위' : 'RANGE'} value={recipe.blur_range} max={3} step={0.1} disabled={!recipe.blur_enabled} display={`${recipe.blur_range.toFixed(1)}px`} onChange={(value) => onHandleRange('blur_range', 3, value)} />
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function RangeSlider({
  label,
  value,
  max,
  step,
  disabled,
  display,
  onChange,
}: {
  label: string
  value: number
  max: number
  step: number
  disabled: boolean
  display: string
  onChange: (value: number) => void
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={fieldLabelStyle}>{label}</span>
        <span style={{ fontSize: 12, color: disabled ? 'var(--text-muted)' : 'var(--text-primary)' }}>{display}</span>
      </div>
      <input
        type="range"
        min={0}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ width: '100%', accentColor: 'var(--accent)' }}
      />
    </div>
  )
}

function OptionChips({
  label,
  value,
  options,
  disabled,
  onChange,
}: {
  label: string
  value: string
  options: Array<{ value: string; label: string }>
  disabled: boolean
  onChange: (value: string) => void
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <span style={fieldLabelStyle}>{label}</span>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {options.map((option) => (
          <button
            key={option.value}
            onClick={() => onChange(option.value)}
            disabled={disabled}
            style={{
              ...chipStyle,
              ...(value === option.value ? activeChipStyle : {}),
              opacity: disabled ? 0.55 : 1,
            }}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  )
}

function SubCheck({ label, checked, disabled, onChange }: { label: string; checked: boolean; disabled: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg-tertiary)', color: disabled ? 'var(--text-muted)' : 'var(--text-primary)', opacity: disabled ? 0.6 : 1 }}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span style={{ fontSize: 12, fontWeight: 700 }}>{label}</span>
    </label>
  )
}

function buildPreview(
  kind: string,
  recipe: AugmentationRecipe,
  previewImageUrl: string,
  previewImageSize: { width: number; height: number } | null,
  previewLabel: string,
  emptyText: string,
): ReactNode {
  if (!previewImageUrl) {
    return <div style={techniquePreviewEmptyStyle}>{emptyText}</div>
  }

  const preview = getPreviewConfig(kind, recipe, previewImageSize)
  return (
    <>
      <div style={{ ...techniquePreviewBackdropStyle, ...preview.shellStyle }} />
      {preview.dualFrames ? (
        <div style={techniqueDualPreviewRowStyle}>
          {preview.dualFrames.map((frame, index) => (
            <div key={index} style={{ ...techniquePreviewFrameStyle, ...preview.frameStyle, ...frame.frameStyle }}>
              <img src={previewImageUrl} alt={previewLabel || kind} style={{ ...techniquePreviewImageStyle, ...frame.imageStyle }} />
              {frame.label && <div style={techniqueDualPreviewLabelStyle}>{frame.label}</div>}
            </div>
          ))}
        </div>
      ) : (
        <div style={{ ...techniquePreviewFrameStyle, ...preview.frameStyle }}>
          <img src={previewImageUrl} alt={previewLabel || kind} style={{ ...techniquePreviewImageStyle, ...preview.imageStyle }} />
          {preview.overlay}
        </div>
      )}
      <div style={techniquePreviewOverlayStyle}>{previewLabel || kind}</div>
    </>
  )
}

function getPreviewConfig(
  kind: string,
  recipe: AugmentationRecipe,
  previewImageSize: { width: number; height: number } | null,
): { imageStyle?: CSSProperties; shellStyle?: CSSProperties; frameStyle?: CSSProperties; overlay?: ReactNode; dualFrames?: Array<{ imageStyle: CSSProperties; frameStyle?: CSSProperties; label?: string }> } {
  const shared: { imageStyle?: CSSProperties; shellStyle?: CSSProperties; frameStyle?: CSSProperties; overlay?: ReactNode; dualFrames?: Array<{ imageStyle: CSSProperties; frameStyle?: CSSProperties; label?: string }> } = {
    imageStyle: {},
    shellStyle: {},
    frameStyle: computePreviewFrameStyle(previewImageSize),
  }

  if (kind === 'tiling' && recipe.tiling_enabled) {
    const cell = 100 / recipe.tiling_grid
    shared.overlay = (
      <div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(255,255,255,0.45) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.45) 1px, transparent 1px)', backgroundSize: `${cell}% ${cell}%`, pointerEvents: 'none' }} />
    )
  }

  if (kind === 'auto_orient' && recipe.auto_orient_enabled) {
    shared.imageStyle = { transform: 'rotate(-3deg) scale(0.94)' }
  }

  if (kind === 'isolate_objects' && recipe.isolate_objects_enabled) {
    shared.imageStyle = { transform: 'scale(0.96)' }
    shared.overlay = <div style={{ position: 'absolute', inset: 18, border: '2px dashed rgba(255,255,255,0.75)', borderRadius: 18, pointerEvents: 'none' }} />
  }

  if (kind === 'resize' && recipe.resize_enabled) {
    const maxDim = Math.max(previewImageSize?.width ?? recipe.resize_size, previewImageSize?.height ?? recipe.resize_size, 1)
    const sideRatio = Math.max(0.38, Math.min(1, recipe.resize_size / maxDim))
    shared.frameStyle = {
      left: '50%',
      top: '50%',
      width: `${Math.max(32, sideRatio * 70)}%`,
      aspectRatio: '1 / 1',
      transform: 'translate(-50%, -50%)',
    }
    shared.imageStyle = {
      objectFit: recipe.resize_mode === 'stretch' ? 'fill' : 'contain',
      background: 'transparent',
      padding: 0,
    }
    shared.shellStyle = { background: 'linear-gradient(135deg, rgba(var(--accent-rgb),0.14), rgba(255,255,255,0.04))' }
    shared.frameStyle = {
      ...shared.frameStyle,
      background: recipe.resize_mode === 'stretch'
        ? 'transparent'
        : recipe.resize_mode === 'white_edges' ? '#ffffff' : '#000000',
    }
  }

  if (kind === 'grayscale' && recipe.grayscale_enabled) {
    shared.imageStyle = { filter: 'grayscale(1)' }
  }

  if (kind === 'adjust_contrast' && recipe.adjust_contrast_enabled) {
    shared.imageStyle = {
      filter: recipe.adjust_contrast_mode === 'equalize' ? 'contrast(1.2) saturate(1.05)' : 'contrast(1.45)',
    }
  }

  if (kind === 'horizontal_flip' && recipe.horizontal_flip_enabled) {
    shared.imageStyle = { transform: 'scaleX(-1)' }
  }

  if (kind === 'flip') {
    const transforms: string[] = []
    if (recipe.horizontal_flip_enabled) transforms.push('scaleX(-1)')
    if (recipe.vertical_flip_enabled) transforms.push('scaleY(-1)')
    shared.imageStyle = { transform: transforms.length > 0 ? transforms.join(' ') : 'none' }
  }

  if (kind === 'vertical_flip' && recipe.vertical_flip_enabled) {
    shared.imageStyle = { transform: 'scaleY(-1)' }
  }

  if (kind === 'rotate' && (recipe.rotate_cw90_enabled || recipe.rotate_cw270_enabled)) {
    shared.imageStyle = { transform: recipe.rotate_cw90_enabled ? 'rotate(90deg) scale(0.76)' : 'rotate(-90deg) scale(0.76)' }
  }

  if (kind === 'rotate_free' && recipe.rotate_enabled) {
    shared.imageStyle = { transform: `rotate(${Math.min(15, recipe.rotate_range)}deg)` }
  }

  if (kind === 'shear' && recipe.shear_enabled) {
    shared.imageStyle = { transform: `skew(${Math.min(15, recipe.shear_x_range)}deg, ${Math.min(15, recipe.shear_y_range)}deg)` }
  }

  if (kind === 'brightness' && recipe.brightness_enabled) {
    shared.dualFrames = [
      { imageStyle: { filter: `brightness(${Math.max(0.1, 1 - Math.abs(recipe.brightness_range))})` }, label: '-'} ,
      { imageStyle: { filter: `brightness(${1 + Math.abs(recipe.brightness_range)})` }, label: '+' },
    ]
  }

  if (kind === 'contrast' && recipe.contrast_enabled) {
    shared.dualFrames = [
      { imageStyle: { filter: `brightness(${Math.max(0.7, 1 - Math.abs(recipe.contrast_range))})` }, label: '-' },
      { imageStyle: { filter: `brightness(${1 + Math.abs(recipe.contrast_range)})` }, label: '+' },
    ]
  }

  if (kind === 'saturation' && recipe.saturation_enabled) {
    shared.dualFrames = [
      { imageStyle: { filter: `saturate(${Math.max(0, 1 - Math.abs(recipe.saturation_range))})` }, label: '-' },
      { imageStyle: { filter: `saturate(${1 + Math.abs(recipe.saturation_range)})` }, label: '+' },
    ]
  }

  if (kind === 'hue' && recipe.hue_enabled) {
    shared.dualFrames = [
      { imageStyle: { filter: `hue-rotate(-${Math.abs(recipe.hue_range)}deg)` }, label: '-' },
      { imageStyle: { filter: `hue-rotate(${Math.abs(recipe.hue_range)}deg)` }, label: '+' },
    ]
  }

  if (kind === 'blur' && recipe.blur_enabled) {
    shared.imageStyle = { filter: `blur(${Math.min(2.8, Math.abs(recipe.blur_range))}px)` }
  }

  return shared
}

function summarizeRecipe(recipe: AugmentationRecipe | null, language: 'en' | 'ko'): string {
  if (!recipe) return language === 'ko' ? '원본 데이터셋' : 'Raw dataset'

  const parts: string[] = []
  if (recipe.auto_orient_enabled) parts.push(language === 'ko' ? '자동 방향 보정' : 'Auto-Orient')
  if (recipe.resize_enabled) parts.push(`${language === 'ko' ? '리사이즈' : 'Resize'} ${recipe.resize_size}x${recipe.resize_size}`)
  if (recipe.grayscale_enabled) parts.push(language === 'ko' ? '흑백 변환' : 'Grayscale')
  if (recipe.adjust_contrast_enabled) parts.push(language === 'ko'
    ? (recipe.adjust_contrast_mode === 'equalize' ? '히스토그램 평활화' : '대비 스트레칭')
    : (recipe.adjust_contrast_mode === 'equalize' ? 'Histogram EQ' : 'Contrast Stretch'))
  if (recipe.horizontal_flip_enabled) parts.push('HFlip')
  if (recipe.vertical_flip_enabled) parts.push('VFlip')
  if (recipe.rotate_cw90_enabled || recipe.rotate_cw270_enabled) parts.push(language === 'ko' ? '90º 회전' : 'Rotate 90º')
  if (recipe.rotate_enabled && Math.abs(recipe.rotate_range) > 0) parts.push(`${language === 'ko' ? '회전' : 'Rotate'} ±${Math.abs(recipe.rotate_range).toFixed(0)}º`)
  if (recipe.shear_enabled && (Math.abs(recipe.shear_x_range) > 0 || Math.abs(recipe.shear_y_range) > 0)) parts.push(`${language === 'ko' ? '기울이기' : 'Shear'} H ${toMagnitudeLabel(recipe.shear_x_range, 0, 'º')} / V ${toMagnitudeLabel(recipe.shear_y_range, 0, 'º')}`)
  if (recipe.brightness_enabled && Math.abs(recipe.brightness_range) > 0) parts.push(`${language === 'ko' ? '밝기' : 'Brightness'} ${toPercentLabel(recipe.brightness_range, 0)}`)
  if (recipe.contrast_enabled && Math.abs(recipe.contrast_range) > 0) parts.push(`${language === 'ko' ? '노출' : 'Exposure'} ${toPercentLabel(recipe.contrast_range, 0)}`)
  if (recipe.saturation_enabled && Math.abs(recipe.saturation_range) > 0) parts.push(`${language === 'ko' ? '채도' : 'Saturation'} ${toPercentLabel(recipe.saturation_range, 0)}`)
  if (recipe.hue_enabled && Math.abs(recipe.hue_range) > 0) parts.push(`${language === 'ko' ? '색조' : 'Hue'} ±${Math.abs(recipe.hue_range).toFixed(0)}º`)
  if (recipe.blur_enabled && Math.abs(recipe.blur_range) > 0) parts.push(`${language === 'ko' ? '블러' : 'Blur'} ${recipe.blur_range.toFixed(1)}px`)
  if (recipe.tiling_enabled) parts.push(`${language === 'ko' ? '타일링' : 'Tiling'} ${recipe.tiling_grid}x${recipe.tiling_grid}`)
  if (recipe.isolate_objects_enabled) parts.push(language === 'ko' ? '객체 분리' : 'Isolate Objects')
  return parts.join(' · ')
}

function computePreviewFrameStyle(previewImageSize: { width: number; height: number } | null): CSSProperties {
  if (previewImageSize == null || previewImageSize.width <= 0 || previewImageSize.height <= 0) {
    return { inset: 12 }
  }

  const containerWidth = 1000
  const containerHeight = 320
  const padding = 16
  const scale = Math.min(
    (containerWidth - padding * 2) / previewImageSize.width,
    (containerHeight - padding * 2) / previewImageSize.height,
  )
  const width = previewImageSize.width * scale
  const height = previewImageSize.height * scale
  const left = ((containerWidth - width) / 2 / containerWidth) * 100
  const top = ((containerHeight - height) / 2 / containerHeight) * 100

  return {
    left: `${left}%`,
    top: `${top}%`,
    width: `${(width / containerWidth) * 100}%`,
    height: `${(height / containerHeight) * 100}%`,
  }
}

function getIssueColor(code: FinishImageIssue['code']): string {
  if (code === 'missing_annotations') return '#dc2626'
  if (code === 'missing_labels') return '#b45309'
  return 'var(--split-unassigned)'
}

function toDisplayStatus(status: 'unlabeled' | 'in_progress' | 'labeled' | 'approved'): 'unlabeled' | 'labeled' | 'approved' {
  return status === 'in_progress' ? 'labeled' : status
}

function getStatusColor(status: Exclude<StatusFilter, 'all'>): string {
  if (status === 'unlabeled') return 'var(--status-unlabeled)'
  if (status === 'approved') return 'var(--status-approved)'
  return 'var(--status-labeled)'
}

function getSplitColor(split: SplitType): string {
  if (split === 'train') return 'var(--split-train)'
  if (split === 'val') return 'var(--split-val)'
  if (split === 'test') return 'var(--split-test)'
  return 'var(--split-unassigned)'
}

function Badge({ color, label, subtle = false }: { color: string; label: string; subtle?: boolean }) {
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      padding: subtle ? '4px 8px' : '5px 9px',
      borderRadius: 999,
      background: subtle ? 'rgba(255,255,255,0.04)' : `${color}18`,
      border: `1px solid ${subtle ? 'rgba(255,255,255,0.08)' : `${color}55`}`,
      color,
      fontSize: 11,
      fontWeight: 700,
      whiteSpace: 'nowrap',
    }}>
      {label}
    </span>
  )
}

const loadingScreenStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  height: '100vh',
  color: 'var(--text-muted)',
}

const finishHeaderStyle: CSSProperties = {
  height: 48,
  padding: '0 12px',
  borderBottom: '1px solid var(--border)',
  background: 'var(--bg-secondary)',
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  flexShrink: 0,
}

const finishBackButtonStyle: CSSProperties = {
  minWidth: 146,
  height: 30,
  padding: '4px 10px',
  borderRadius: 5,
  color: 'var(--text-secondary)',
  fontSize: 13,
  background: 'none',
  flexShrink: 0,
}

const finishBadgeStyle: CSSProperties = {
  padding: '4px 10px',
  borderRadius: 999,
  background: 'rgba(var(--accent-rgb),0.12)',
  border: '1px solid rgba(var(--accent-rgb),0.28)',
  color: 'var(--accent)',
  fontSize: 11,
  fontWeight: 800,
  whiteSpace: 'nowrap',
}

const finishIconButtonStyle: CSSProperties = {
  width: 32,
  height: 30,
  borderRadius: 5,
  border: '1px solid var(--border)',
  background: 'var(--bg-tertiary)',
  color: 'var(--text-secondary)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
}

const panelStyle: CSSProperties = {
  padding: 16,
  borderRadius: 16,
  border: '1px solid var(--border)',
  background: 'var(--bg-secondary)',
}

const panelTitleStyle: CSSProperties = {
  fontSize: 16,
  fontWeight: 800,
  color: 'var(--text-primary)',
  marginBottom: 10,
}

const bodyTextStyle: CSSProperties = {
  fontSize: 13,
  color: 'var(--text-secondary)',
  lineHeight: 1.65,
}

const statGridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
  gap: 12,
}

const statCardStyle: CSSProperties = {
  padding: '18px 16px',
  borderRadius: 16,
  border: '1px solid var(--border)',
  background: 'var(--bg-secondary)',
}

const overviewGridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1.15fr) minmax(320px, 0.85fr)',
  gap: 16,
}

const accordionStyle: CSSProperties = {
  borderRadius: 12,
  border: '1px solid var(--border)',
  background: 'var(--bg-tertiary)',
  overflow: 'hidden',
}

const blockerImageButtonStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
  padding: '11px 12px',
  borderRadius: 10,
  background: 'var(--bg-secondary)',
  border: '1px solid var(--border)',
  textAlign: 'left',
}

const datasetHeaderStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '2.2fr 0.8fr 0.8fr 0.6fr 2fr 0.8fr',
  padding: '12px 16px',
  fontSize: 11,
  fontWeight: 800,
  color: 'var(--text-muted)',
  borderBottom: '1px solid var(--border)',
}

const datasetRowStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '2.2fr 0.8fr 0.8fr 0.6fr 2fr 0.8fr',
  gap: 10,
  padding: '14px 16px',
  alignItems: 'center',
  borderBottom: '1px solid rgba(255,255,255,0.05)',
}

const stepTitleStyle: CSSProperties = {
  fontSize: 14,
  fontWeight: 800,
  color: 'var(--text-primary)',
  marginBottom: 6,
}

const techniqueGridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
  gap: 14,
  marginTop: 12,
}

const techniqueSummaryCardStyle: CSSProperties = {
  padding: 14,
  borderRadius: 16,
  border: '1px solid var(--border)',
  background: 'var(--bg-tertiary)',
  textAlign: 'left',
}

const techniqueModalOverlayStyle: CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 9999,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 20,
  background: 'rgba(0,0,0,0.56)',
  backdropFilter: 'blur(6px)',
}

const techniqueModalStyle: CSSProperties = {
  width: 'min(860px, calc(100vw - 40px))',
  maxHeight: 'calc(100vh - 40px)',
  overflowY: 'auto',
  padding: 20,
  borderRadius: 20,
  border: '1px solid var(--border)',
  background: 'var(--bg-secondary)',
  boxShadow: 'var(--shadow-lg)',
}

const modalCloseButtonStyle: CSSProperties = {
  width: 32,
  height: 32,
  borderRadius: 999,
  border: '1px solid var(--border)',
  background: 'var(--bg-tertiary)',
  color: 'var(--text-primary)',
  fontSize: 18,
  lineHeight: 1,
}

const techniqueModalPreviewStyle: CSSProperties = {
  position: 'relative',
  borderRadius: 12,
  overflow: 'hidden',
  background: 'linear-gradient(135deg, rgba(var(--accent-rgb),0.14), rgba(255,255,255,0.04))',
  border: '1px solid rgba(255,255,255,0.08)',
  height: 320,
}

const modalCheckRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '10px 12px',
  borderRadius: 10,
  border: '1px solid var(--border)',
  background: 'var(--bg-tertiary)',
  color: 'var(--text-primary)',
  fontSize: 13,
  fontWeight: 700,
}

const techniqueCardStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
  padding: 14,
  borderRadius: 16,
  border: '1px solid var(--border)',
  background: 'var(--bg-tertiary)',
}

const techniquePreviewShellStyle: CSSProperties = {
  position: 'relative',
  height: 164,
  borderRadius: 12,
  overflow: 'hidden',
  background: 'linear-gradient(135deg, rgba(var(--accent-rgb),0.14), rgba(255,255,255,0.04))',
  border: '1px solid rgba(255,255,255,0.08)',
}

const techniquePreviewBackdropStyle: CSSProperties = {
  position: 'absolute',
  inset: 0,
  background: 'linear-gradient(135deg, rgba(var(--accent-rgb),0.08), rgba(255,255,255,0.03))',
}

const techniquePreviewFrameStyle: CSSProperties = {
  position: 'absolute',
  overflow: 'hidden',
  borderRadius: 12,
  border: '1px solid rgba(255,255,255,0.08)',
}

const techniqueDualPreviewRowStyle: CSSProperties = {
  position: 'absolute',
  inset: 0,
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: 16,
  padding: 18,
}

const techniqueDualPreviewLabelStyle: CSSProperties = {
  position: 'absolute',
  top: 8,
  right: 8,
  width: 22,
  height: 22,
  borderRadius: 999,
  background: 'rgba(0,0,0,0.54)',
  color: 'white',
  fontSize: 11,
  fontWeight: 800,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
}

const techniquePreviewImageStyle: CSSProperties = {
  display: 'block',
  width: '100%',
  height: '100%',
  objectFit: 'contain',
  transition: 'transform 0.18s ease, filter 0.18s ease',
}

const techniquePreviewOverlayStyle: CSSProperties = {
  position: 'absolute',
  left: 10,
  bottom: 10,
  padding: '4px 8px',
  borderRadius: 999,
  background: 'rgba(0,0,0,0.58)',
  color: 'white',
  fontSize: 10,
  fontWeight: 700,
  maxWidth: 'calc(100% - 20px)',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
}

const techniquePreviewEmptyStyle: CSSProperties = {
  width: '100%',
  height: '100%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  textAlign: 'center',
  padding: 16,
  fontSize: 12,
  lineHeight: 1.6,
  color: 'var(--text-muted)',
}

const estimateCardStyle: CSSProperties = {
  padding: '12px 14px',
  borderRadius: 12,
  background: 'var(--bg-tertiary)',
  border: '1px solid var(--border)',
}

const fieldLabelStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 800,
  color: 'var(--text-muted)',
  letterSpacing: '0.08em',
}

const inputStyle: CSSProperties = {
  minHeight: 40,
  padding: '9px 12px',
  borderRadius: 10,
  border: '1px solid var(--border)',
  background: 'var(--bg-tertiary)',
  color: 'var(--text-primary)',
  fontSize: 13,
}

const dualInputRowStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 28px 1fr',
  gap: 8,
  alignItems: 'center',
}

const dualInputRowCompactStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr) auto minmax(0, 1fr)',
  gap: 8,
  alignItems: 'center',
}

const resizeTimesStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 16,
  fontWeight: 800,
  color: 'var(--text-muted)',
}

const secondaryButtonStyle: CSSProperties = {
  minHeight: 36,
  padding: '8px 12px',
  borderRadius: 10,
  border: '1px solid var(--border)',
  background: 'var(--bg-tertiary)',
  color: 'var(--text-primary)',
  fontSize: 12,
  fontWeight: 800,
}

const primaryGhostButtonStyle: CSSProperties = {
  ...secondaryButtonStyle,
  background: 'rgba(var(--accent-rgb),0.12)',
  border: '1px solid rgba(var(--accent-rgb),0.32)',
  color: 'var(--accent)',
}

const secondaryButtonWideStyle: CSSProperties = {
  ...secondaryButtonStyle,
  width: '100%',
}

const primaryButtonWideStyle: CSSProperties = {
  ...primaryGhostButtonStyle,
  width: '100%',
  color: 'white',
  background: 'var(--accent)',
  border: 'none',
}

const chipStyle: CSSProperties = {
  minHeight: 34,
  padding: '8px 10px',
  borderRadius: 10,
  border: '1px solid var(--border)',
  background: 'var(--bg-secondary)',
  color: 'var(--text-secondary)',
  fontSize: 12,
  fontWeight: 700,
}

const activeChipStyle: CSSProperties = {
  background: 'rgba(var(--accent-rgb),0.12)',
  border: '1px solid rgba(var(--accent-rgb),0.36)',
  color: 'var(--accent)',
}

const dangerButtonStyle: CSSProperties = {
  ...secondaryButtonStyle,
  color: '#dc2626',
  border: '1px solid rgba(220,38,38,0.2)',
  background: 'rgba(220,38,38,0.08)',
}

const formatGridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
  gap: 8,
}

const formatButtonStyle: CSSProperties = {
  minHeight: 38,
  borderRadius: 10,
  border: '1px solid var(--border)',
  background: 'var(--bg-tertiary)',
  color: 'var(--text-secondary)',
  fontSize: 12,
  fontWeight: 800,
}

const activeFormatButtonStyle: CSSProperties = {
  background: 'rgba(var(--accent-rgb),0.12)',
  border: '1px solid rgba(var(--accent-rgb),0.34)',
  color: 'var(--accent)',
}

const exportResultCardStyle: CSSProperties = {
  padding: '12px 12px',
  borderRadius: 10,
  background: 'rgba(34,197,94,0.08)',
  border: '1px solid rgba(34,197,94,0.22)',
}
