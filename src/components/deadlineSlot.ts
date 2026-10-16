import { createContext } from 'react'

/**
 * 화면 머리 줄 안 발주 마감 알림 자리(DeadlineAlertSlot)를 SideMenuLayout에 알리는 통로.
 * 자리가 있으면 SideMenuLayout은 본문 위 공용 알림 줄을 그리지 않는다(알림이 한 번만, 데이터가 한 줄 아래로 밀리지 않게).
 * null이면 SideMenuLayout 밖(터치 화면 등) — 자리도 그리지 않는다.
 */
export const DeadlineSlotContext = createContext<((present: boolean) => void) | null>(null)
