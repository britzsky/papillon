import { buildApiUrl } from '../config/api'

/** 식단표 PDF 등에서 거래처 메뉴 새로 등록. 식재료 1개 이상·칼로리 필수, menu_id는 서버가 AM-…로 발급 */
export type AccountMenuRegisterInput = {
  account_id: string
  menu_name: string
  /** PDF에 적힌 원래 표기 */
  menu_name_raw?: string
  calories_per_serving: number
  food_type: number
  menu_type: number
  menu_gubun: number
  meal_plan_type: number
  ingredients: Array<{ ingredient_id: string; ingredient_name_raw?: string; qty_num: number; qty_unit: string }>
}

const userId = () => (typeof window !== 'undefined' ? localStorage.getItem('user_id') ?? '' : '')

async function post<T>(path: string, body: Record<string, unknown>, failure: string): Promise<T> {
  const response = await fetch(buildApiUrl(path), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, user_id: userId() }),
  })
  const payload = await response.json().catch(() => null) as (T & { message?: string }) | null
  if (!response.ok || !payload) throw new Error(payload?.message || failure)
  return payload
}

export function registerAccountMenu(input: AccountMenuRegisterInput) {
  return post<{ menu_id: string; menu_name: string }>('/v2/menu-management/menus/register-new', input, '거래처 메뉴를 등록하지 못했습니다.')
}

/** 본사 메뉴를 거래처 메뉴로 가져온다(레시피·칼로리 복사) */
export function importStandardMenu(accountId: string, menuId: string) {
  return post<{ menu_id: string; menu_name: string }>('/v2/menu-management/menus/import-standard', { account_id: accountId, menu_id: menuId }, '본사 메뉴를 가져오지 못했습니다.')
}

/** 거래처 전용 메뉴를 같은 ID로 본사 메뉴에도 등록 */
export function promoteAccountMenu(accountId: string, menuId: string) {
  return post<{ menu_id: string }>('/v2/menu-management/menus/promote', { account_id: accountId, menu_id: menuId }, '본사 메뉴로 반영하지 못했습니다.')
}

/** 등록 창 식재료 목록: 거래처 식재료(메뉴·재고 기준). standard_yn은 본사 식자재에 같은 ID가 있는지 */
export type AccountIngredient = { ingredient_id: string; ingredient_name: string; category_name: string; base_unit: string; standard_yn: 'Y' | 'N' }

export async function getAccountIngredients(accountId: string): Promise<AccountIngredient[]> {
  const response = await fetch(buildApiUrl(`/v2/menu-management/ingredients/account?${new URLSearchParams({ account_id: accountId })}`))
  const payload = await response.json().catch(() => null) as AccountIngredient[] | { message?: string } | null
  if (!response.ok || !Array.isArray(payload)) throw new Error((payload as { message?: string } | null)?.message || '거래처 식재료를 불러오지 못했습니다.')
  return payload.map(item => ({ ...item, category_name: item.category_name ?? '', ingredient_name: item.ingredient_name ?? item.ingredient_id }))
}

/** 거래처 식재료 직접 추가(본사 식자재 없이). 기준단위 g/ml/EA */
export function registerAccountIngredient(accountId: string, input: { ingredient_name: string; base_unit: string; category_name?: string }) {
  return post<AccountIngredient>('/v2/menu-management/ingredients/register-new', { account_id: accountId, ...input }, '식재료를 추가하지 못했습니다.')
}

/** 본사 반영 미리보기. action: SAME 같은 본사 식자재 · MATCHED 이름·단위가 같은 본사 식자재에 연결 · NEW 본사 식자재로 새로 추가 */
export type PromotePreview = {
  menu_name: string
  blocked_reason: string | null
  ingredients: Array<{ ingredient_id: string; ingredient_name: string; base_unit: string; action: 'SAME' | 'MATCHED' | 'NEW'; standard_name: string }>
}

export async function getPromotePreview(accountId: string, menuId: string): Promise<PromotePreview> {
  const response = await fetch(buildApiUrl(`/v2/menu-management/menus/promote-preview?${new URLSearchParams({ account_id: accountId, menu_id: menuId })}`))
  const payload = await response.json().catch(() => null) as (PromotePreview & { message?: string }) | null
  if (!response.ok || !payload) throw new Error(payload?.message || '본사 반영 내용을 확인하지 못했습니다.')
  return payload
}
