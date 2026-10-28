export type OrderTab = 'recommended' | 'plan' | 'stock' | 'usage' | 'favorites' | 'myProducts' | 'products'
/** 예전 '부족 식자재' 탭. 주소·링크 호환용으로만 받아 source에 맞는 기준 탭으로 바꾼다. */
export type LegacyOrderTab = 'shortage'

// 부족량 기준 세 가지를 따로 탭으로 둔다(예전 '부족 식자재' 탭 안의 기준 버튼을 한 줄로 합침).
export const ORDER_TABS: { key: OrderTab; label: string; short: string; hint: string }[] = [
  { key: 'recommended', label: '추천 발주안', short: '추천 발주안', hint: '납품일 하루치 식단(또는 최근 사용량) 부족분을 기존 사용상품으로 미리 골라 둔 발주안' },
  { key: 'plan', label: '식단표 기준 부족량', short: '식단 기준', hint: '저장된 식단의 필요량 + 안전재고 − 현재고 − 입고예정으로 계산' },
  { key: 'stock', label: '현재 부족 재고 바로 주문', short: '현재 부족', hint: '현재고가 없거나 안전재고보다 적은 식자재를 바로 주문' },
  { key: 'usage', label: '최근 사용량 기준 부족 예상', short: '사용량 예상', hint: '최근 평균 사용량 × 확보일수 + 안전재고로 앞으로 부족할 식자재' },
  { key: 'favorites', label: '나만의 메뉴 식재료', short: '나만의 메뉴', hint: '나만의 메뉴(♥)에 쓰이는 식재료를 수량만 정해 바로 주문' },
  // 2026-10-27: 하트(♥) 상품을 탭에서 바로 골라 발주(상품 검색 탭 안의 '♥ 나만의 식재료' 보기와 같은 목록)
  { key: 'myProducts', label: '나만의 식재료', short: '나만의 식재료', hint: '♥ 하트로 정한 웰스토리·아워홈 상품을 납품일만 정해 바로 담아 발주' },
  { key: 'products', label: '상품 검색', short: '상품 검색', hint: '웰스토리·아워홈 상품을 직접 찾아 발주. ♥ 나만의 식재료는 맨 위에 보입니다' },
]
export const ORDER_TAB_SOURCE = { plan: 'PLAN', stock: 'STOCK', usage: 'INVENTORY', favorites: 'FAVORITE_MENU' } as const

export function isOrderTab(value: string | null): value is OrderTab {
  return ORDER_TABS.some(item => item.key === value)
}

/** 예전 부족 식자재 주소는 source(PLAN·DRAFT·STOCK·INVENTORY)나 식단표 지정 여부로 기준 탭을 고른다. */
export function sourceTab(params: URLSearchParams): OrderTab {
  const source = params.get('source')
  if (source === 'PLAN' || source === 'DRAFT' || params.get('draft_key') || (!source && params.get('table_id'))) return 'plan'
  if (source === 'STOCK') return 'stock'
  return 'usage'
}

/** 주소(tab·예전 source)와 진입 경로(initialTab)로 지금 탭을 정한다. legacy=예전 '부족 식자재' 진입 */
/** fallback: 주소에 탭이 없을 때. PC는 2026-10-15 개편으로 'plan'(식단표 기준), 터치는 'recommended' 유지 */
export function resolveOrderTab(params: URLSearchParams, initialTab?: OrderTab | LegacyOrderTab, fallback: OrderTab = 'recommended') {
  const queryTab = params.get('tab')
  const legacy = queryTab === 'shortage' || (!isOrderTab(queryTab) && initialTab === 'shortage')
  const tab: OrderTab = isOrderTab(queryTab) ? queryTab : legacy ? sourceTab(params) : (initialTab as OrderTab | undefined) ?? fallback
  return { tab, queryTab, legacy }
}
