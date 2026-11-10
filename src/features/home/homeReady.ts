import { createContext, useContext, useEffect } from 'react'

/**
 * 로그인 직후 PC 홈 준비 화면(HomeSplash, 2026-11-10 사용자 요청: 로그인 후 항목들이 조회·준비되는 동안 로딩 화면).
 * - 로그인 성공(api/auth.ts)이 sessionStorage에 표시를 남기고, 홈이 한 번 쓰고 지운다 → 로그인할 때만 보임(새로고침·메뉴 이동 때는 안 보임).
 *   로그아웃은 sessionStorage를 비우므로 다음 로그인 때 다시 보인다.
 * - 홈 부품은 자기 조회가 끝나면(성공·실패 모두) useReportReady로 알린다. 다 끝나거나 SPLASH_MAX_MS가 지나면 사라진다.
 */
export const SPLASH_FLAG = 'home_splash'
export const SPLASH_MAX_MS = 8000

export const HOME_READY_STEPS = [
  { key: 'session', label: '로그인 확인' },
  { key: 'account', label: '거래처·예산' },
  { key: 'notices', label: '공지사항' },
  { key: 'instagram', label: '인스타그램 소식' },
] as const
export type HomeReadyKey = typeof HOME_READY_STEPS[number]['key']

export const markSplashAfterLogin = () => { try { sessionStorage.setItem(SPLASH_FLAG, '1') } catch { /* 저장 못 하면 준비 화면 없이 */ } }
export const splashPending = () => { try { return sessionStorage.getItem(SPLASH_FLAG) === '1' } catch { return false } }
export const clearSplashFlag = () => { try { sessionStorage.removeItem(SPLASH_FLAG) } catch { /* 무시 */ } }

export const HomeReadyContext = createContext<(key: HomeReadyKey) => void>(() => {})

/** 이 부품의 조회가 끝났음(ready=true)을 홈 준비 화면에 알린다. 준비 화면이 없으면 아무 일도 안 함 */
export function useReportReady(key: HomeReadyKey, ready: boolean) {
  const report = useContext(HomeReadyContext)
  useEffect(() => { if (ready) report(key) }, [key, ready, report])
}
