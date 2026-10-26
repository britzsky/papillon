import { buildApiUrl } from '../config/api'

/**
 * 이 업장(거래처) 메뉴 레시피 한 줄 — 서버 /v2/menu-management/recipes(tb_account_recipe_detail).
 * qty_per_person은 식재료 기준단위(base_unit) 1인 사용량. 단위를 바꿀 수 없던 줄은 review_flag=1, qty_per_person=0
 */
export type AccountRecipeRow = {
  account_recipe_detail_id: number
  recipe_id: number
  menu_id: string
  ingredient_id: string
  ingredient_seq: number
  ingredient_name_raw: string
  ingredient_name_std?: string
  qty_num: number
  qty_unit: string
  qty_per_person: number
  base_unit: string
  review_flag: number
}

/** 레시피 줄 저장(같은 recipe_id·menu_id·ingredient_seq면 덮어씀). 서버가 식재료 기준단위로 qty_base·1인 사용량을 다시 계산한다 */
export type AccountRecipeUpsert = {
  account_id: string
  recipe_id: number
  menu_id: string
  ingredient_id: string
  ingredient_seq: number
  ingredient_name_raw: string
  qty_num: number
  qty_unit: string
}

const userId = () => (typeof window !== 'undefined' ? localStorage.getItem('user_id') ?? '' : '')

async function send(method: 'POST' | 'DELETE', body: Record<string, unknown>, failure: string) {
  const response = await fetch(buildApiUrl('/v2/menu-management/recipes'), {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, user_id: userId() }),
  })
  const payload = await response.json().catch(() => null) as { message?: string } | null
  if (!response.ok) throw new Error(payload?.message || failure)
}

export async function getAccountRecipe(accountId: string, menuId: string): Promise<AccountRecipeRow[]> {
  const response = await fetch(buildApiUrl(`/v2/menu-management/recipes?${new URLSearchParams({ account_id: accountId, menu_id: menuId })}`))
  const payload = await response.json().catch(() => null) as AccountRecipeRow[] | { message?: string } | null
  if (!response.ok || !Array.isArray(payload)) throw new Error((payload as { message?: string } | null)?.message || '이 업장 레시피를 불러오지 못했습니다.')
  return payload.map(row => ({
    ...row,
    qty_num: Number(row.qty_num ?? 0),
    qty_per_person: Number(row.qty_per_person ?? 0),
    ingredient_seq: Number(row.ingredient_seq ?? 0),
    review_flag: Number(row.review_flag ?? 0),
  }))
}

export function saveAccountRecipeRow(row: AccountRecipeUpsert) {
  return send('POST', {
    ...row,
    qty_raw: `${row.qty_num}${row.qty_unit}`,
    recipe_yield_servings: 1,
    // 서버 필수값. 실제 값은 서버가 식재료 기준단위로 다시 계산한다
    qty_base: row.qty_num,
    base_unit: row.qty_unit,
  }, '레시피 줄을 저장하지 못했습니다.')
}

export function deleteAccountRecipeRow(accountRecipeDetailId: number) {
  return send('DELETE', { account_recipe_detail_id: accountRecipeDetailId }, '레시피 줄을 빼지 못했습니다.')
}
