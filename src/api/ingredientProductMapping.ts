import { buildApiUrl } from '../config/api'
import { pickPack } from '../utils/quantityUnits'
import type { SupplierOffer } from './supplierIntegration'

export type IngredientProductLink = {
  account_ingredient_product_id: number; supplier_product_id: number; ingredient_id: string
  supplier_name: string; supplier_item_code: string; product_name: string
  order_unit: string; base_qty: number; base_unit: string; active_yn: string
}
async function request(path: string, body?: Record<string, unknown>): Promise<unknown> {
  const response = await fetch(buildApiUrl(path), { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) })
  if (response.status === 404 && body) throw new Error('상품 연결 관리 API가 없습니다. 변경된 백엔드를 배포·재시작해주세요.')
  const payload = await response.json()
  if (!response.ok || (payload?.code !== undefined && Number(payload.code) !== 200)) throw new Error(payload?.message || '상품 연결 요청에 실패했습니다.')
  return payload
}
function normalizeLinkRows(payload: unknown): IngredientProductLink[] {
  if (!Array.isArray(payload)) throw new Error('상품 연결 조회 응답을 확인할 수 없습니다.')
  return [...new Map(payload.map(row => [Number(row.account_ingredient_product_id), {
    account_ingredient_product_id: Number(row.account_ingredient_product_id), supplier_product_id: Number(row.supplier_product_id),
    ingredient_id: String(row.ingredient_id || ''), supplier_name: String(row.supplier_name || ''),
    supplier_item_code: String(row.supplier_item_code || ''), product_name: String(row.product_name || ''),
    order_unit: String(row.order_unit || ''), base_qty: Number(row.base_qty) || 0, base_unit: String(row.base_unit || ''), active_yn: String(row.active_yn || ''),
  }])).values()]
}
export async function getIngredientProductLinks(accountId: string, ingredientId: string): Promise<IngredientProductLink[]> {
  if (!accountId || !ingredientId) throw new Error('거래처와 식재료 정보가 필요합니다.')
  const payload = await request(`/v2/catalog/account-products?${new URLSearchParams({ account_id: accountId, ingredient_id: ingredientId })}`)
  return normalizeLinkRows(payload)
}
// One call for every ingredient's current link in this account, used by the account ingredient list screen.
export async function getAccountProductLinks(accountId: string): Promise<IngredientProductLink[]> {
  if (!accountId) throw new Error('거래처 정보가 필요합니다.')
  const payload = await request(`/v2/catalog/account-products?${new URLSearchParams({ account_id: accountId, active_yn: 'Y' })}`)
  return normalizeLinkRows(payload)
}
export async function unlinkIngredientProduct(accountId: string, ingredientId: string, linkId: number, userId: string) {
  if (!accountId || !ingredientId || !linkId) throw new Error('해제할 연결을 선택해주세요.')
  return request('/v2/catalog/ingredient-links/change', { action: 'UNLINK', account_id: accountId, ingredient_id: ingredientId, account_ingredient_product_id: linkId, user_id: userId })
}
export type LinkSuggestion = {
  supplier_offer_id: number; supplier_product_id: number; supplier_code: string; supplier_name: string
  product_name: string; supplier_item_code: string; base_qty: number; base_unit: string; purchase_price: number
  score: number; reasons: string[]; warning: string
}
function normalizeSuggestion(raw: unknown): LinkSuggestion {
  const row = raw as Record<string, unknown>
  return {
    supplier_offer_id: Number(row.supplier_offer_id), supplier_product_id: Number(row.supplier_product_id),
    supplier_code: String(row.supplier_code || ''), supplier_name: String(row.supplier_name || ''),
    product_name: String(row.product_name || ''), supplier_item_code: String(row.supplier_item_code || ''),
    base_qty: Number(row.base_qty) || 0, base_unit: String(row.base_unit || ''), purchase_price: Number(row.purchase_price) || 0,
    score: Number(row.score) || 0, reasons: Array.isArray(row.reasons) ? row.reasons.map(String) : [], warning: String(row.warning || ''),
  }
}
/** 식재료에 연결할 상품 추천(최대 5개): 다른 거래처 사용·이 거래처 발주 이력·이름/동의어 근거. 저장은 linkIngredientProduct로. */
export async function getLinkSuggestions(accountId: string, ingredientId: string, deliveryDate: string): Promise<LinkSuggestion[]> {
  const payload = await request(`/v2/catalog/ingredient-links/suggestions?${new URLSearchParams({ account_id: accountId, ingredient_id: ingredientId, delivery_date: deliveryDate })}`) as { suggestions?: unknown[] }
  return (Array.isArray(payload?.suggestions) ? payload.suggestions : []).map(normalizeSuggestion)
}
export type UnlinkedIngredientSuggestion = {
  ingredient_id: string; ingredient_name: string; base_unit: string; category_name: string; menu_usage_count: number; suggestions: LinkSuggestion[]
}
/** 메뉴에 쓰이지만 연결 상품이 없는 식재료 전체와 식재료별 추천(최대 3개). 일괄 연결 화면용. */
export async function getUnlinkedSuggestions(accountId: string, deliveryDate: string): Promise<UnlinkedIngredientSuggestion[]> {
  const payload = await request(`/v2/catalog/ingredient-links/suggestions/unlinked?${new URLSearchParams({ account_id: accountId, delivery_date: deliveryDate })}`) as { ingredients?: unknown[] }
  return (Array.isArray(payload?.ingredients) ? payload.ingredients : []).map(raw => {
    const row = raw as Record<string, unknown>
    return {
      ingredient_id: String(row.ingredient_id || ''), ingredient_name: String(row.ingredient_name || ''), base_unit: String(row.base_unit || ''),
      category_name: String(row.category_name || ''), menu_usage_count: Number(row.menu_usage_count) || 0,
      suggestions: Array.isArray(row.suggestions) ? row.suggestions.map(normalizeSuggestion) : [],
    }
  })
}
export async function linkIngredientProduct(input: {
  accountId: string; ingredientId: string; baseUnit: string; offer: SupplierOffer; userId: string; replaceLinkId?: number
}) {
  const { accountId, ingredientId, baseUnit, offer, userId, replaceLinkId } = input
  if (!accountId || !ingredientId || !offer.supplier_product_id || !offer.supplier_offer_id) throw new Error('거래처·식재료·상품을 선택해주세요.')
  // 상품 규격(무게·개수 등) 중 식재료 기준단위에 맞는 것을 이 연결의 규격으로 보낸다. 백엔드가 같은 규칙으로 다시 검증한다.
  const pack = pickPack(offer.pack_options, baseUnit)
  if (!pack) throw new Error('식재료와 상품의 단위를 환산할 수 없습니다. g와 ml는 자동 변환하지 않습니다.')
  return request('/v2/catalog/ingredient-links/change', {
    action: replaceLinkId ? 'REPLACE' : 'LINK', account_id: accountId, ingredient_id: ingredientId,
    ...(replaceLinkId ? { account_ingredient_product_id: replaceLinkId } : {}),
    supplier_product_id: offer.supplier_product_id, supplier_offer_id: offer.supplier_offer_id,
    expected_ingredient_id: offer.linked_ingredient_id, base_qty: pack.base_qty, base_unit: pack.base_unit, order_unit: offer.order_unit, user_id: userId,
  })
}
