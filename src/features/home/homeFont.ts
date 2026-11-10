import { useState } from 'react'

/**
 * 새 홈 글꼴 시험용 임시 선택기(2026-11-09 사용자 요청: 인스타 버튼 위, 세 글꼴 비교). 고른 값은 이 브라우저에만 기억.
 * 정식 글꼴이 정해지면 이 파일·TopMenuLayout의 data-font·CSS의 [data-font] 규칙을 정리한다.
 */
export const HOME_FONTS = [
  { key: 'segoe', label: 'Segoe UI', note: '지금 글꼴' },
  { key: 'april16th', label: 'April16th', note: '사월십육일체 안전체' },
  { key: 'honesty', label: '116angduk honesty 1.5', note: '116앵덕정직체' },
] as const
export type HomeFont = typeof HOME_FONTS[number]['key']

const STORAGE_KEY = 'home_font_trial'

export function useHomeFont() {
  const [font, setFont] = useState<HomeFont>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      return HOME_FONTS.some(item => item.key === saved) ? saved as HomeFont : 'segoe'
    } catch { return 'segoe' }
  })
  const choose = (next: HomeFont) => {
    setFont(next)
    try { localStorage.setItem(STORAGE_KEY, next) } catch { /* 저장 못 해도 지금 화면엔 적용 */ }
  }
  return [font, choose] as const
}

/**
 * 글씨 크기 시험(2026-11-10 사용자 요청: 글꼴 고르는 곳 밑에서 지금보다 몇 px 키워 보기). 이 브라우저에만 기억.
 * TopMenuLayout이 --home-fs-plus로 넘기면 TopMenuLayout.css가 전역 크기 규칙의 빼는 값·최솟값을 그만큼 옮긴다 → 모든 글씨가 같은 px만큼 커지고 작아짐.
 */
export const HOME_FONT_SIZE_RANGE = { min: -2, max: 6 } as const
const SIZE_KEY = 'home_font_size_trial'

export function useHomeFontSize() {
  const [plus, setPlus] = useState<number>(() => {
    try {
      const saved = Number(localStorage.getItem(SIZE_KEY))
      return Number.isInteger(saved) && saved >= HOME_FONT_SIZE_RANGE.min && saved <= HOME_FONT_SIZE_RANGE.max ? saved : 0
    } catch { return 0 }
  })
  const choose = (next: number) => {
    const value = Math.min(HOME_FONT_SIZE_RANGE.max, Math.max(HOME_FONT_SIZE_RANGE.min, next))
    setPlus(value)
    try { localStorage.setItem(SIZE_KEY, String(value)) } catch { /* 저장 못 해도 지금 화면엔 적용 */ }
  }
  return [plus, choose] as const
}
