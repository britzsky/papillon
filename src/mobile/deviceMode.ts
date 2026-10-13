/**
 * 모바일·태블릿 화면 전환 규칙.
 * - 터치 기기(손가락 입력, 마우스 hover 없음)는 모바일 화면이 있는 PC 주소로 들어오면 /m 주소로 보낸다.
 * - 사용자가 'PC 화면'을 고르면 localStorage에 남겨 다시 보내지 않는다('모바일 화면'을 고르면 해제).
 */
const UI_MODE_KEY = 'ui_mode'

/** PC 주소 → 같은 기능의 모바일 주소. 모바일 화면을 하나 만들 때마다 여기에 추가한다. */
export const MOBILE_ROUTES: Record<string, string> = {
  '/operations/table-meals': '/m/table-meals',
}

export const PC_ROUTES: Record<string, string> = Object.fromEntries(Object.entries(MOBILE_ROUTES).map(([pc, mobile]) => [mobile, pc]))

export function isTouchDevice() {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia('(pointer: coarse)').matches && !window.matchMedia('(hover: hover)').matches
}

export function getUiModePreference(): 'pc' | 'mobile' | '' {
  try {
    const value = localStorage.getItem(UI_MODE_KEY)
    return value === 'pc' || value === 'mobile' ? value : ''
  } catch {
    return ''
  }
}

export function setUiModePreference(mode: 'pc' | 'mobile') {
  try { localStorage.setItem(UI_MODE_KEY, mode) } catch { /* 저장 못 해도 이번 이동은 그대로 한다 */ }
}
