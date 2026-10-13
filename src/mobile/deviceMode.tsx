import type { ReactNode } from 'react'

/**
 * PC 화면과 터치(태블릿·휴대폰) 화면 고르기. 주소는 하나이고, 페이지를 열 때 한 번만 정한다.
 * 창 크기를 실시간으로 따라가면 화면이 통째로 바뀌며 입력 중인 내용이 사라지므로 따라가지 않는다.
 * - 터치 기기(손가락 입력, 마우스 hover 없음) 또는 폭 768px 미만이면 터치 화면.
 */
function detectTouchUi() {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  const touch = window.matchMedia('(pointer: coarse)').matches && !window.matchMedia('(hover: hover)').matches
  return touch || window.innerWidth < 768
}

export const IS_TOUCH_UI = detectTouchUi()

/** 터치 화면이 있는 주소에서 기기에 맞는 화면을 보여준다. 터치 화면이 없는 주소는 PC 화면을 그대로 쓴다. */
export function DeviceRoute({ pc, touch }: { pc: ReactNode; touch: ReactNode }) {
  return IS_TOUCH_UI ? touch : pc
}

