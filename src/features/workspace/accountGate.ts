import { isHeadquarters, workspaceAccountId } from './workspaceAccount'

/** 거래처를 고르지 않아도 되는 화면(본사 공통 기준정보·전체 현황) */
export const ACCOUNT_FREE_PATHS = ['/home', '/home/sidebar', '/operations/menu', '/inventory/ingredients', '/operations/search-analytics', '/operations/ai-usage', '/operations/meal-slots', '/operations/meal-plan-templates', '/order_manager/supplier-sites', '/order_manager/welstory', '/order_manager', '/distribution/products', '/distribution/partners', '/distribution/orders', '/distribution/accounts', '/mall', '/mall/cart', '/mall/orders']

/**
 * 본사가 '전체 거래처'인 채로 거래처가 필요한 화면을 열었는지 — 그러면 화면 대신 거래처 선택 안내(AccountChoiceNotice).
 * 사이드 메뉴 틀·상단 메뉴 틀 공용(2026-11-10 SideMenuLayout에서 옮김). 더채움몰 주문 상세(/mall/orders/번호)도 거래처와 무관
 */
export function needsAccountChoice(pathname: string, search: string) {
  return isHeadquarters() && !workspaceAccountId(search) && !ACCOUNT_FREE_PATHS.includes(pathname) && !pathname.startsWith('/mall/')
}
