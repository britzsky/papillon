import type { ReactNode } from 'react'

/**
 * PC 화면과 터치(태블릿·휴대폰) 화면 고르기. 주소는 하나이고, 페이지를 열 때 한 번만 정한다.
 * 창 크기를 실시간으로 따라가면 화면이 통째로 바뀌며 입력 중인 내용이 사라지므로 따라가지 않는다.
 * - 터치 기기(손가락 입력, 마우스 hover 없음) 또는 폭 768px 미만이면 터치 화면.
 * - 확인용 강제 전환(2026-11-23): 주소에 ?ui=touch 또는 ?ui=pc 를 붙이면 이 탭에서 그 화면으로 고정(sessionStorage), ?ui=auto 로 해제.
 *   PC 브라우저 창을 태블릿 크기로 줄이기만 하면 마우스가 있어서 PC 화면이 나오므로, 태블릿 화면을 PC에서 볼 때 쓴다.
 */
const FORCE_KEY = 'ui-mode'

function forcedMode(): 'touch' | 'pc' | '' {
  try {
    const value = new URLSearchParams(window.location.search).get('ui')
    if (value === 'touch' || value === 'pc') sessionStorage.setItem(FORCE_KEY, value)
    else if (value === 'auto') sessionStorage.removeItem(FORCE_KEY)
    const saved = sessionStorage.getItem(FORCE_KEY)
    return saved === 'touch' || saved === 'pc' ? saved : ''
  } catch { return '' }
}

function detectTouchUi() {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  const forced = forcedMode()
  if (forced) return forced === 'touch'
  const touch = window.matchMedia('(pointer: coarse)').matches && !window.matchMedia('(hover: hover)').matches
  return touch || window.innerWidth < 768
}

export const IS_TOUCH_UI = detectTouchUi()

/** 터치 화면이 있는 주소에서 기기에 맞는 화면을 보여준다. 터치 화면이 없는 주소는 PC 화면을 그대로 쓴다. */
export function DeviceRoute({ pc, touch }: { pc: ReactNode; touch: ReactNode }) {
  return IS_TOUCH_UI ? touch : pc
}
