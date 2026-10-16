/**
 * 업무 순서(2026-10-16 사용자 결정: 식단표부터 발주까지 클릭 5번 안). 펼치지 않아도 늘 보이게 맨 위에 번호로 둔다.
 * 재고는 식단 사용 확정·입고로 자동 반영되므로 마지막 확인 단계.
 */
export const workflowSteps: { no: number; label: string; to: string; basePaths: string[] }[] = [
  { no: 1, label: '식단표', to: '/operations/table-meals', basePaths: ['/operations/table-meals'] },
  { no: 2, label: '발주하기', to: '/order_manager/order', basePaths: ['/order_manager/order', '/order_manager/recommended', '/order_manager/product-order', '/order_manager/food_order', '/home/sidebar/food-order'] },
  { no: 3, label: '발주서·입고', to: '/order_manager/orders', basePaths: ['/order_manager/orders'] },
  { no: 4, label: '재고', to: '/inventory/account', basePaths: ['/inventory/account'] },
]

export const matchesBase = (pathname: string, basePath: string) => pathname === basePath || pathname.startsWith(`${basePath}/`)

/** 지금 화면이 업무 순서 몇 번째인지(아니면 0) */
export const workflowIndex = (pathname: string) => workflowSteps.findIndex((step) => step.basePaths.some((basePath) => matchesBase(pathname, basePath))) + 1
