/**
 * 지금 관리하는 거래처(2026-10-16 사용자 결정).
 * - 거래처 계정(user_type 3): 자기 거래처로 고정. 주소의 account_id는 무시한다(다른 거래처를 고를 수 없다).
 * - 본사 계정: 모든 거래처 중 골라 관리한다. 주소(?account_id) → 마지막으로 고른 거래처 순. 고른 값은 화면을 옮겨도 유지된다.
 *   빈 값('')은 '전체 거래처'(홈은 전체 현황, 거래처가 필요한 화면은 선택 안내).
 */
const KEY = 'workspace_account_id'

const read = (key: string) => { try { return localStorage.getItem(key) || '' } catch { return '' } }

export const isHeadquarters = () => read('user_type') !== '3'

/** 거래처 계정의 자기 거래처 */
export const ownAccountId = () => read('account_id')

/** 주소가 가리키는 거래처(?account_id, 통합 검색 거래처 결과 ?type=vendor&id=) */
export function urlAccountId(search?: URLSearchParams | string): string {
  const params = typeof search === 'string' ? new URLSearchParams(search) : search
  return params?.get('account_id') || (params?.get('type') === 'vendor' ? params.get('id') || '' : '')
}

export function workspaceAccountId(search?: URLSearchParams | string): string {
  if (!isHeadquarters()) return ownAccountId()
  return urlAccountId(search) || read(KEY)
}

/** 본사가 고른 거래처를 기억한다(거래처 계정은 아무것도 하지 않음) */
export function rememberWorkspaceAccount(accountId: string) {
  if (!isHeadquarters()) return
  try { if (accountId) localStorage.setItem(KEY, accountId); else localStorage.removeItem(KEY) } catch { /* 저장소를 못 쓰면 주소로만 유지 */ }
}

/** 거래처를 바꿀 때 빼는 주소 값(다른 거래처의 식단표·발주서 등을 가리키므로) */
const ACCOUNT_SCOPED = ['account_id', 'id', 'table_id', 'purchase_order_id', 'draft_key', 'ingredient_id', 'account_ingredient_product_id', 'autoselect', 'type', 'q']

/** 같은 화면을 다른 거래처로 여는 주소 */
export function accountSwitchUrl(pathname: string, search: string, accountId: string) {
  const params = new URLSearchParams(search)
  ACCOUNT_SCOPED.forEach(key => params.delete(key))
  if (accountId) params.set('account_id', accountId)
  const query = params.toString()
  return query ? `${pathname}?${query}` : pathname
}
