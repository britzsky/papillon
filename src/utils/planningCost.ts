/** 메뉴 편성 단가 출처 라벨 (서버 MenuMapper.accountIngredientPlanningPrices의 source 값, 2026-10-22: 식재료 단위) */
export const planningCostSourceLabels: Record<string, string> = {
  MANUAL: '직접 입력', RECEIPT: '입고 단가(재고 평균·최근 입고)', STANDARD: '본사 표준 단가', LEGACY_PRICE: '예전 공급가',
  RECENT_RECEIPT: '최근 입고 단가',
}
