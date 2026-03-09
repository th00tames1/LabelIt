import { useSettingsStore } from './store/settingsStore'
import type { AppLanguage, ImageStatus, SplitType } from './types'

type MessageTree = {
  [key: string]: string | MessageTree
}

const messages: Record<AppLanguage, MessageTree> = {
  en: {
    common: {
      language: 'Language',
      english: 'English',
      korean: 'Korean',
      cancel: 'Cancel',
      dismiss: 'Dismiss',
      loading: 'Loading',
      refresh: 'Refresh',
    },
    home: {
      subtitle: 'Fully local, offline-capable image annotation',
      newProject: '+ New Project',
      openProject: 'Open Project',
      recentProjects: 'Recent Projects',
      newProjectTitle: 'New Project',
      projectName: 'Project Name',
      projectNamePlaceholder: 'My Dataset',
      chooseFolder: 'Choose Folder ->',
      creating: 'Creating...',
    },
    topbar: {
      home: '<- Home',
      backHome: 'Back to home',
      selectTool: 'Select',
      bboxTool: 'BBox',
      polygonTool: 'Polygon',
      keypointTool: 'Keypoint',
      activeLabelMissing: 'No label',
      activeLabelTitle: 'Active label class (press 1-9 to change)',
      activeLabelMissingTitle: 'Create a label in the Labels tab before drawing',
      toolLocked: 'Create a label before using drawing tools',
      aiOffline: 'AI sidecar offline',
      visibilityVisible: 'Visible',
      visibilityHidden: 'Hidden',
      hideAnnotations: 'Hide annotations (H)',
      showAnnotations: 'Show annotations (H)',
      autoLabel: 'Auto Label',
      autoLabelTitle: 'Run YOLO auto-label',
      autoSplit: 'Split',
      autoSplitTitle: 'Auto-split images into train/val/test',
      export: 'Export',
      exportTitle: 'Export dataset',
      shortcuts: '?',
      shortcutsTitle: 'Keyboard shortcuts (?)',
      aiOn: 'AI On',
      aiOff: 'AI Off',
    },
    tabs: {
      annotations: 'Annotations',
      labels: 'Labels',
      stats: 'Stats',
    },
    annotate: {
      noImages: 'No images. Import images from the left sidebar.',
      onboardingTitle: 'Create your first label before drawing',
      onboardingBody: '1. Open the Labels tab. 2. Add a class name and color. 3. Pick a drawing tool and annotate.',
      openLabels: 'Open Labels',
      openAnnotations: 'Open Annotations',
    },
    notice: {
      createLabelTitle: 'Create a label first',
      createLabelMessage: 'Add your first label in the Labels tab before drawing on the canvas.',
      cannotCompleteTitle: 'Cannot mark complete yet',
      cannotCompleteMessage: 'Add at least one annotation before marking this image as labeled.',
      labelEveryAnnotationTitle: 'Label every annotation first',
      labelEveryAnnotationMessage: 'Assign a class to each annotation before marking the image complete.',
      reviewAutoLabelsTitle: 'Review auto labels first',
      reviewAutoLabelsMessage: 'Accept or reject auto-labeled annotations before marking the image complete.',
    },
    labelManager: {
      placeholder: 'Label name...',
      add: '+ Add Label',
      emptyTitle: 'Create your first label to start annotating.',
      emptyStep1: '1. Enter a class name such as Plant or Weed.',
      emptyStep2: '2. Pick a color and add the label.',
      emptyStep3: '3. Choose a drawing tool and annotate the image.',
      changeColor: 'Click to change color',
      delete: 'Delete label',
    },
    sidebar: {
      imagesButton: '+ Images',
      folderButton: 'Folder',
      imagesCount: '{count} image{suffix}',
      importing: 'importing...',
      dropHint: 'Drop images here or use the buttons above',
      selectedImage: 'Selected Image',
      noImageSelected: 'Select an image to inspect its status and split.',
      status: 'Status',
      split: 'Split',
      advancedHint: 'Tip: right-click an image for the quick menu.',
      contextStatus: 'STATUS',
      contextSplit: 'SPLIT',
    },
    quickPick: {
      title: 'Assign label',
      help: 'Enter confirm  ·  Esc skip',
      empty: 'No labels yet. Create labels in the Labels panel.',
    },
    annotationList: {
      undo: 'Undo',
      redo: 'Redo',
      undoTitle: 'Undo (Ctrl+Z)',
      redoTitle: 'Redo (Ctrl+Y)',
      autoToReview: '{count} auto-label{suffix} to review',
      filter: 'Filter',
      showAll: 'Show all',
      acceptAll: 'Accept All',
      rejectAll: 'Reject All',
      acceptAllTitle: 'Accept all — converts yolo_auto to manual annotations',
      rejectAllTitle: 'Reject all — deletes all yolo_auto annotations',
      noAutoAnnotations: 'No auto-label annotations.',
      noAnnotations: 'No annotations. Use tools to draw.',
      unlabeled: 'Unlabeled',
      acceptTitle: 'Accept — keep as manual annotation',
      rejectTitle: 'Reject — delete this annotation',
      delete: 'Delete',
    },
    stats: {
      failedToLoad: 'Failed to load stats',
      overview: 'OVERVIEW',
      images: 'Images',
      labeled: 'Labeled',
      annotations: 'Annotations',
      byStatus: 'BY STATUS',
      bySplit: 'BY SPLIT',
      byClass: 'BY CLASS',
      noData: 'No data',
      noAnnotationsYet: 'No annotations yet',
    },
    status: {
      unlabeled: 'Unlabeled',
      in_progress: 'In Progress',
      labeled: 'Labeled',
      approved: 'Approved',
    },
    split: {
      train: 'Train',
      val: 'Val',
      test: 'Test',
      unassigned: 'Unassigned',
    },
  },
  ko: {
    common: {
      language: '언어',
      english: '영어',
      korean: '한국어',
      cancel: '취소',
      dismiss: '닫기',
      loading: '불러오는 중',
      refresh: '새로고침',
    },
    home: {
      subtitle: '로컬에서 실행되는 오프라인 이미지 어노테이션 도구',
      newProject: '+ 새 프로젝트',
      openProject: '프로젝트 열기',
      recentProjects: '최근 프로젝트',
      newProjectTitle: '새 프로젝트',
      projectName: '프로젝트 이름',
      projectNamePlaceholder: '내 데이터셋',
      chooseFolder: '폴더 선택 ->',
      creating: '생성 중...',
    },
    topbar: {
      home: '<- 홈',
      backHome: '홈으로 돌아가기',
      selectTool: '선택',
      bboxTool: '박스',
      polygonTool: '폴리곤',
      keypointTool: '키포인트',
      activeLabelMissing: '라벨 없음',
      activeLabelTitle: '현재 라벨 클래스 (1-9 키로 변경)',
      activeLabelMissingTitle: '그리기 전에 Labels 탭에서 라벨을 먼저 만드세요',
      toolLocked: '그리기 도구를 사용하려면 먼저 라벨을 만드세요',
      aiOffline: 'AI 사이드카가 오프라인입니다',
      visibilityVisible: '표시 중',
      visibilityHidden: '숨김',
      hideAnnotations: '어노테이션 숨기기 (H)',
      showAnnotations: '어노테이션 표시하기 (H)',
      autoLabel: '자동 라벨링',
      autoLabelTitle: 'YOLO 자동 라벨링 실행',
      autoSplit: '분할',
      autoSplitTitle: '이미지를 train/val/test로 자동 분할',
      export: '내보내기',
      exportTitle: '데이터셋 내보내기',
      shortcuts: '?',
      shortcutsTitle: '키보드 단축키 (?)',
      aiOn: 'AI 켜짐',
      aiOff: 'AI 꺼짐',
    },
    tabs: {
      annotations: '어노테이션',
      labels: '라벨',
      stats: '통계',
    },
    annotate: {
      noImages: '이미지가 없습니다. 왼쪽 사이드바에서 이미지를 가져오세요.',
      onboardingTitle: '그리기 전에 첫 라벨을 먼저 만드세요',
      onboardingBody: '1. Labels 탭을 엽니다. 2. 클래스 이름과 색상을 추가합니다. 3. 도구를 선택하고 어노테이션합니다.',
      openLabels: '라벨 열기',
      openAnnotations: '어노테이션 열기',
    },
    notice: {
      createLabelTitle: '먼저 라벨을 만드세요',
      createLabelMessage: '캔버스에 그리기 전에 Labels 탭에서 첫 라벨을 추가하세요.',
      cannotCompleteTitle: '아직 완료 처리할 수 없습니다',
      cannotCompleteMessage: '이 이미지를 라벨 완료로 표시하기 전에 어노테이션을 하나 이상 추가하세요.',
      labelEveryAnnotationTitle: '모든 어노테이션에 라벨을 지정하세요',
      labelEveryAnnotationMessage: '이미지를 완료 처리하기 전에 각 어노테이션에 클래스를 지정하세요.',
      reviewAutoLabelsTitle: '자동 라벨을 먼저 검토하세요',
      reviewAutoLabelsMessage: '이미지를 완료 처리하기 전에 자동 라벨 어노테이션을 승인 또는 거절하세요.',
    },
    labelManager: {
      placeholder: '라벨 이름...',
      add: '+ 라벨 추가',
      emptyTitle: '어노테이션을 시작하려면 첫 라벨을 만드세요.',
      emptyStep1: '1. 예: Plant, Weed 같은 클래스 이름을 입력하세요.',
      emptyStep2: '2. 색상을 고르고 라벨을 추가하세요.',
      emptyStep3: '3. 도구를 선택하고 이미지를 어노테이션하세요.',
      changeColor: '색상 변경',
      delete: '라벨 삭제',
    },
    sidebar: {
      imagesButton: '+ 이미지',
      folderButton: '폴더',
      imagesCount: '{count}개 이미지',
      importing: '가져오는 중...',
      dropHint: '여기에 이미지를 드롭하거나 위 버튼을 사용하세요',
      selectedImage: '선택된 이미지',
      noImageSelected: '이미지를 선택하면 상태와 분할을 여기서 바로 바꿀 수 있습니다.',
      status: '상태',
      split: '분할',
      advancedHint: '팁: 이미지 우클릭 메뉴에서도 빠르게 바꿀 수 있습니다.',
      contextStatus: '상태',
      contextSplit: '분할',
    },
    quickPick: {
      title: '라벨 지정',
      help: 'Enter 확인  ·  Esc 건너뛰기',
      empty: '아직 라벨이 없습니다. Labels 패널에서 라벨을 만드세요.',
    },
    annotationList: {
      undo: '실행 취소',
      redo: '다시 실행',
      undoTitle: '실행 취소 (Ctrl+Z)',
      redoTitle: '다시 실행 (Ctrl+Y)',
      autoToReview: '검토할 자동 라벨 {count}개',
      filter: '필터',
      showAll: '전체 보기',
      acceptAll: '모두 승인',
      rejectAll: '모두 거절',
      acceptAllTitle: '모든 yolo_auto 어노테이션을 수동 어노테이션으로 승인',
      rejectAllTitle: '모든 yolo_auto 어노테이션 삭제',
      noAutoAnnotations: '자동 라벨 어노테이션이 없습니다.',
      noAnnotations: '어노테이션이 없습니다. 도구를 사용해 그려보세요.',
      unlabeled: '미지정',
      acceptTitle: '승인 — 수동 어노테이션으로 유지',
      rejectTitle: '거절 — 이 어노테이션 삭제',
      delete: '삭제',
    },
    stats: {
      failedToLoad: '통계를 불러오지 못했습니다',
      overview: '요약',
      images: '이미지',
      labeled: '완료',
      annotations: '어노테이션',
      byStatus: '상태별',
      bySplit: '분할별',
      byClass: '클래스별',
      noData: '데이터가 없습니다',
      noAnnotationsYet: '아직 어노테이션이 없습니다',
    },
    status: {
      unlabeled: '미라벨',
      in_progress: '작업 중',
      labeled: '라벨 완료',
      approved: '검수 완료',
    },
    split: {
      train: '학습',
      val: '검증',
      test: '테스트',
      unassigned: '미지정',
    },
  },
}

function getMessage(language: AppLanguage, key: string): string | undefined {
  return key.split('.').reduce<string | MessageTree | undefined>((acc, part) => {
    if (acc == null || typeof acc === 'string') return undefined
    return acc[part]
  }, messages[language]) as string | undefined
}

function interpolate(template: string, values?: Record<string, string | number>): string {
  if (!values) return template
  return Object.entries(values).reduce(
    (result, [key, value]) => result.split(`{${key}}`).join(String(value)),
    template,
  )
}

export function translate(
  language: AppLanguage,
  key: string,
  values?: Record<string, string | number>,
): string {
  const fallback = getMessage('en', key) ?? key
  const message = getMessage(language, key) ?? fallback
  return interpolate(message, values)
}

export function useI18n() {
  const language = useSettingsStore((s) => s.settings.language)

  return {
    language,
    t: (key: string, values?: Record<string, string | number>) => translate(language, key, values),
    statusLabel: (status: ImageStatus) => translate(language, `status.${status}`),
    splitLabel: (split: SplitType) => translate(language, `split.${split}`),
    formatDate: (value: number | string | Date) => {
      const locale = language === 'ko' ? 'ko-KR' : 'en-US'
      return new Intl.DateTimeFormat(locale).format(new Date(value))
    },
  }
}
