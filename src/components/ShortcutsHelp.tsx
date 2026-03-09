/**
 * ShortcutsHelp — keyboard shortcut reference overlay.
 * Triggered by "?" key or the "?" button in TopBar.
 */
import { useEffect } from 'react'
import { useUIStore } from '../store/uiStore'

export default function ShortcutsHelp() {
  const setShow = useUIStore((s) => s.setShowShortcutsHelp)

  // Close on Escape or outside click
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShow(false)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [setShow])

  const groups: { title: string; rows: [string, string][] }[] = [
    {
      title: '🖼  이미지 탐색',
      rows: [
        ['→  /  Tab', '다음 이미지'],
        ['←  /  Shift+Tab', '이전 이미지'],
        ['N', '다음 미라벨 이미지로 이동'],
        ['Space', '현재 이미지 "라벨 완료" 처리 후 다음'],
      ],
    },
    {
      title: '🔧  도구 선택',
      rows: [
        ['V', '선택 (Select)'],
        ['W', '바운딩 박스 (BBox)'],
        ['E', '폴리곤 (Polygon)'],
        ['K', '키포인트 (Keypoint)'],
        ['S', 'SAM AI 세그멘테이션'],
      ],
    },
    {
      title: '🏷  라벨 선택',
      rows: [
        ['1 – 9', '라벨 클래스 빠른 선택 (순서대로)'],
        ['어노테이션 그린 후 팝업', '클릭 또는 숫자키로 라벨 지정'],
      ],
    },
    {
      title: '✏️  어노테이션 편집',
      rows: [
        ['Ctrl+Z', '실행 취소 (Undo)'],
        ['Ctrl+Y  /  Ctrl+Shift+Z', '다시 실행 (Redo)'],
        ['Ctrl+D', '선택된 어노테이션 복제'],
        ['Delete  /  Backspace', '선택된 어노테이션 삭제'],
        ['Escape', '현재 그리기 취소'],
      ],
    },
    {
      title: '🖱  캔버스 조작',
      rows: [
        ['스크롤 휠', '확대 / 축소'],
        ['가운데 마우스 드래그', '이미지 패닝'],
        ['Alt + 왼쪽 드래그', '이미지 패닝'],
        ['F  /  0', '화면에 맞게 이미지 크기 조정 (Fit)'],
        ['더블클릭 (Polygon)', '현재 폴리곤 확정'],
        ['오른클릭 (Polygon 꼭짓점)', '꼭짓점 삭제'],
      ],
    },
    {
      title: '👁  보기',
      rows: [
        ['H', '어노테이션 보기 ON / OFF 토글'],
        ['?', '이 단축키 도움말 열기 / 닫기'],
      ],
    },
    {
      title: '🤖  SAM AI 도구',
      rows: [
        ['왼쪽 클릭', '긍정 포인트 (포함 영역)'],
        ['오른쪽 클릭', '부정 포인트 (제외 영역)'],
        ['Enter', '마스크 확정 (Commit)'],
        ['텍스트 입력 + Enter', '텍스트 프롬프트로 감지'],
      ],
    },
  ]

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 99999,
        background: 'rgba(0,0,0,0.72)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        backdropFilter: 'blur(4px)',
      }}
      onClick={() => setShow(false)}
    >
      <div
        style={{
          background: '#141420',
          border: '1px solid #2a2a3e',
          borderRadius: 12,
          padding: '24px 28px',
          maxWidth: 680,
          width: '90vw',
          maxHeight: '85vh',
          overflowY: 'auto',
          boxShadow: '0 20px 60px rgba(0,0,0,0.7)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginBottom: 20,
        }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: '#e2e2e2', margin: 0 }}>
            ⌨️  키보드 단축키
          </h2>
          <button
            onClick={() => setShow(false)}
            style={{
              background: 'none', border: 'none', color: '#666',
              fontSize: 20, cursor: 'pointer', padding: '0 4px',
            }}
          >×</button>
        </div>

        {/* Shortcut groups in 2-column layout */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          {groups.map((g) => (
            <div key={g.title}>
              <div style={{
                fontSize: 11, fontWeight: 700, color: '#6366f1',
                letterSpacing: '0.07em', textTransform: 'uppercase',
                marginBottom: 8, paddingBottom: 5,
                borderBottom: '1px solid #1e1e2e',
              }}>
                {g.title}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                {g.rows.map(([key, desc]) => (
                  <div key={key} style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                    <code style={{
                      fontSize: 11, color: '#a5b4fc', background: '#1e1e2e',
                      border: '1px solid #2a2a3e', borderRadius: 4,
                      padding: '1px 6px', whiteSpace: 'nowrap', flexShrink: 0,
                      fontFamily: 'monospace',
                    }}>
                      {key}
                    </code>
                    <span style={{ fontSize: 12, color: '#9ca3af' }}>{desc}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div style={{
          marginTop: 20, paddingTop: 14,
          borderTop: '1px solid #1e1e2e',
          fontSize: 11, color: '#4b5563', textAlign: 'center',
        }}>
          Esc 또는 바깥 클릭으로 닫기
        </div>
      </div>
    </div>
  )
}
