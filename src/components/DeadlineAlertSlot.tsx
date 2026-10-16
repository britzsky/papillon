import { useContext, useLayoutEffect } from 'react'
import DeadlineAlertBanner from './DeadlineAlertBanner'
import { DeadlineSlotContext } from './deadlineSlot'

/** 화면 머리 줄(제목과 버튼 사이)에 놓는 발주 마감 알림 자리. 2026-10-16 사용자 요청: 알림 때문에 한 줄이 더 생기지 않게 */
export default function DeadlineAlertSlot() {
  const register = useContext(DeadlineSlotContext)
  // 그리기 전에 알려 본문 위 공용 알림이 한 번도 보이지 않게
  useLayoutEffect(() => {
    if (!register) return
    register(true)
    return () => register(false)
  }, [register])
  return register ? <DeadlineAlertBanner inline /> : null
}
