/**
 * 역할별로 보이는 화면(PC 사이드 메뉴·터치 메뉴·주소 직접 입력 공통).
 * - 본사 전용: 공급사 설정·본사 기준정보·본사 금액대 식단표 템플릿·끼니 종류 관리
 * - 현장(거래처) 전용: 거래처 메뉴 관리·본사 메뉴 가져오기(2026-10-22 사용자 결정: 본사는 본사 메뉴로 바로 식단을 만들어 필요 없음)
 */
export const HQ_ONLY_PATHS = [
  '/order_manager/suppliers', '/order_manager/supplier-sites', '/order_manager/welstory', '/inventory/ingredients',
  '/operations/menu', '/operations/account', '/operations/search-analytics', '/operations/ai-usage', '/operations/meal-plan-templates', '/operations/meal-slots',
]

export const SITE_ONLY_PATHS = ['/operations/account-menu', '/operations/account-menu/import']

export const isSiteUser = () => localStorage.getItem('user_type') === '3'

/** 지금 로그인한 역할로 볼 수 있는 화면인지 */
export function visibleForRole(path: string | undefined) {
  if (!path) return true
  const base = path.split('?')[0]
  return isSiteUser() ? !HQ_ONLY_PATHS.includes(base) : !SITE_ONLY_PATHS.includes(base)
}
