import { createContext, useContext } from 'react'

/**
 * 로그인 여부(2026-11-12 사용자 결정): 따로 있던 로그인 화면 대신 PC 홈(/home)을 바로 열고, 접속자 카드(예산 자리)에서 로그인한다.
 * 로그인 안 한 손님은 홈·더채움몰만 볼 수 있다(GUEST 경로). 홈의 바로가기·상단 메뉴는 보이기만 하고 누를 수 없다(더채움몰 제외).
 * WorkspaceBoundary가 서버 세션(/User/Session)을 확인해 값을 넣는다. 서버도 손님에게는 더채움몰 상품 보기·인스타그램만 연다(WorkspaceAccess.guestReadable).
 */
export type SessionState = 'user' | 'guest'
export const SessionContext = createContext<SessionState>('user')

/** 로그인한 사용자인지(손님이면 false) */
export const useSignedIn = () => useContext(SessionContext) === 'user'

/** 손님도 열 수 있는 화면: PC 홈과 더채움몰(장바구니·내 주문은 열리지만 로그인 안내만 보임) */
export const isGuestPath = (pathname: string) => pathname === '/home' || pathname === '/mall' || pathname.startsWith('/mall/')

/** 손님이 눌러도 되는 메뉴 주소(더채움몰) */
export const guestCanOpen = (to: string | undefined) => Boolean(to) && isGuestPath(to!.split('?')[0]) && to!.split('?')[0] !== '/home'

/** 서버 세션이 없을 때 남아 있던 이전 로그인 정보를 지운다(역할·거래처가 화면·요청에 섞이지 않게) */
export function forgetLocalUser() {
  for (const key of ['user_type', 'user_name', 'user_id', 'account_id', 'account_name']) localStorage.removeItem(key)
}

export const LOGIN_REQUIRED_TITLE = '로그인 후 이용할 수 있어요'
