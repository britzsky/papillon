/** 메뉴 편성 단가 출처 라벨 (서버 MenuMapper.accountProductPlanningPrices의 source 값) */
export const planningCostSourceLabels: Record<string, string> = {
  MANUAL: '직접 입력', SITE_PRICE: '거래처 공급가', COMMON_PRICE: '공통 공급가',
  SITE_PRICE_NEAREST: '거래처 공급가(가까운 날짜)', COMMON_PRICE_NEAREST: '공통 공급가(가까운 날짜)',
  RECENT_RECEIPT: '최근 입고 단가', INVENTORY_AVERAGE: '보유 재고 평균단가',
}
