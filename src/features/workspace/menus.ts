import { matchesBase } from './workflow'
import { visibleForRole } from './roleScreens'

/** PC 메뉴 정의 — 사이드 메뉴(SideMenuLayout)와 상단 메뉴(TopMenuLayout, 2026-11-09 홈)가 같이 쓴다 */
export type SubMenuItem = {
  label: string
  to?: string
  exact?: boolean
}

export type MajorMenu = {
  key: string
  label: string
  basePaths: string[]
  items: SubMenuItem[]
}

/**
 * 카테고리는 업무 순서대로(2026-10-16 사용자 결정: 식단표부터 발주까지 클릭 5번 안).
 * 운영관리(식단표) → 발주관리(발주하기·발주서) → 재고관리(재고) 순서이고, 각 카테고리 첫 메뉴가 그 단계의 화면이다.
 */
export const majorMenus: MajorMenu[] = [
  {
    key: 'operations',
    label: '운영관리',
    basePaths: ['/operations/table-meals', '/operations/menu', '/operations/account-menu', '/operations/meal-plan-templates'],
    items: [
      { label: '식단표 관리', to: '/operations/table-meals', exact: true },
      { label: '템플릿 식단표 관리', to: '/operations/meal-plan-templates', exact: true },
      // 2026-10-26: 거래처 메뉴 관리·본사 메뉴 가져오기는 메뉴에서 뺌(레시피 수정은 식단표에서 메뉴를 눌러 '이 업장 레시피 수정'). 주소는 당분간 열림
      { label: '메뉴 관리', to: '/operations/menu', exact: true },
    ],
  },
  {
    key: 'order',
    label: '발주관리',
    basePaths: ['/order_manager'],
    items: [
      { label: '발주하기', to: '/order_manager/order', exact: true },
      { label: '발주서·입고 관리', to: '/order_manager/orders', exact: true },
      { label: '공급사 통합 연동', to: '/order_manager/suppliers', exact: true },
      { label: '공급사 사업장 매핑', to: '/order_manager/supplier-sites', exact: true },
    ],
  },
  {
    key: 'inventory',
    label: '재고관리',
    basePaths: ['/inventory'],
    items: [
      { label: '거래처별 재고관리', to: '/inventory/account', exact: true },
      { label: '재고 변동 이력', to: '/inventory/history', exact: true },
      { label: '식자재 관리', to: '/inventory/ingredients', exact: true },
    ],
  },
  {
    key: 'sanitation',
    label: '위생관리',
    basePaths: ['/sanitation'],
    items: [{ label: '위생 점검 관리', to: '/sanitation/vendor', exact: true }],
  },
  {
    // 더채움몰(2026-11-02): 본사·현장 누구나 상품을 보고 주문. 내 주문(결제 안내·배송조회·취소)은 주문한 사람 본인 것만
    key: 'mall',
    label: '더채움몰',
    basePaths: ['/mall'],
    items: [
      { label: '상품 보기', to: '/mall', exact: true },
      { label: '장바구니·주문', to: '/mall/cart', exact: true },
      { label: '내 주문', to: '/mall/orders' },
    ],
  },
  {
    // 더채움 유통(2026-11-02): 본사가 유통 관리자로 협력사·상품을 관리
    key: 'distribution',
    label: '협력사 관리',
    basePaths: ['/distribution'],
    items: [
      { label: '주문 관리', to: '/distribution/orders', exact: true },
      { label: '상품 관리', to: '/distribution/products', exact: true },
      { label: '거래처 결제 설정', to: '/distribution/accounts', exact: true },
      { label: '협력사·기본 설정', to: '/distribution/partners', exact: true },
    ],
  },
  {
    key: 'headquarters',
    label: '본사관리',
    basePaths: ['/operations/account', '/operations/meal-slots', '/operations/search-analytics', '/operations/ai-usage'],
    items: [
      { label: '고객사 관리', to: '/operations/account', exact: true },
      { label: '끼니 종류 관리', to: '/operations/meal-slots', exact: true },
      { label: '검색어 관리', to: '/operations/search-analytics', exact: true },
      { label: 'AI 사용 이력', to: '/operations/ai-usage', exact: true },
    ],
  },
]

export function findActiveMenuKey(pathname: string) {
  // '/operations/account'는 '/operations/account-menu'의 앞부분이라 정확히 비교한다
  const matchedMenu = majorMenus.find((menu) => menu.basePaths.some((basePath) =>
    basePath === '/operations/account' ? pathname === basePath : matchesBase(pathname, basePath)))

  return matchedMenu?.key ?? ''
}

/** 지금 로그인한 역할이 볼 수 있는 대분류·메뉴(현장 계정은 본사관리·협력사 관리 없음) */
export function menusForRole(): MajorMenu[] {
  const site = localStorage.getItem('user_type') === '3'
  return majorMenus
    .filter(menu => !site || (menu.key !== 'headquarters' && menu.key !== 'distribution'))
    .map(menu => ({ ...menu, items: menu.items.filter(item => visibleForRole(item.to)) }))
    .filter(menu => menu.items.length > 0)
}
