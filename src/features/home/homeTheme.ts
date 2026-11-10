import { useEffect, useState } from 'react'

/**
 * 상단 메뉴 화면(PC 홈) 밝은/어두운 테마(2026-11-10 사용자 요청: 머리 줄 맨 오른쪽 달·스위치·해).
 * 고른 값은 이 브라우저에만 기억. 처음엔 밝은 테마. 적용 범위는 TopMenuLayout 안(data-theme) — 사이드 메뉴 업무 화면은 아직 밝은 테마뿐.
 */
export type HomeTheme = 'light' | 'dark'

const STORAGE_KEY = 'home_theme'

export function useHomeTheme() {
  const [theme, setTheme] = useState<HomeTheme>(() => {
    try { return localStorage.getItem(STORAGE_KEY) === 'dark' ? 'dark' : 'light' } catch { return 'light' }
  })
  // 팝오버(알림·사용자 정보)는 최상위 층이라도 DOM은 TopMenuLayout 안이라 같은 규칙을 받는다. 스크롤바·입력칸 색은 color-scheme으로
  useEffect(() => {
    const root = document.documentElement
    const previous = root.style.colorScheme
    root.style.colorScheme = theme
    return () => { root.style.colorScheme = previous }
  }, [theme])
  const choose = (next: HomeTheme) => {
    setTheme(next)
    try { localStorage.setItem(STORAGE_KEY, next) } catch { /* 저장 못 해도 지금 화면엔 적용 */ }
  }
  return [theme, choose] as const
}
