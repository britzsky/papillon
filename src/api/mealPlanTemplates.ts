import { buildApiUrl } from '../config/api'
import { getLocalUserId } from './inventory'

/**
 * 본사 금액대 식단표 템플릿(2026-10-22). 금액대 = 1일 식단가(조·중·석 합계)를 1,000원 단위로 올린 값
 * (12,001~13,000원 → 13,000원 템플릿). 금액대·식단유형별 최대 3개(순번 1~3). 메뉴는 본사 메뉴.
 */
export type MealPlanTemplate = {
  meal_plan_template_id: number
  price_tier: number
  meal_plan_type: number
  template_seq: number
  template_name: string
  note?: string | null
  active_yn: 'Y' | 'N'
  item_count: number
  day_count: number
  mod_at?: string | null
  created_at?: string | null
}

export type MealPlanTemplateItem = {
  template_item_id?: number
  day_index: number
  meal_slot_code: number
  meal_slot_name?: string
  sort_order?: number
  menu_id: string
  menu_name?: string
  food_type?: number
  menu_type?: number
  menu_gubun?: number
  meal_plan_type?: number
  calories_per_serving?: number | null
}

export type MealPlanTemplateDetail = MealPlanTemplate & { items: MealPlanTemplateItem[] }

export type AccountTemplates = {
  daily_budget: number | null
  budget_breakdown?: string | null
  price_tier: number | null
  templates: MealPlanTemplate[]
  message?: string
}

async function readJson<T>(response: Response, fallback: string): Promise<T> {
  const text = await response.text()
  const body = text ? JSON.parse(text) : null
  if (!response.ok) throw new Error((body as { message?: string } | null)?.message || fallback)
  return body as T
}

const num = (value: unknown) => value == null || value === '' ? 0 : Number(value)

function normalizeTemplate(row: Record<string, unknown>): MealPlanTemplate {
  return {
    meal_plan_template_id: num(row.meal_plan_template_id),
    price_tier: num(row.price_tier),
    meal_plan_type: num(row.meal_plan_type),
    template_seq: num(row.template_seq),
    template_name: String(row.template_name ?? ''),
    note: row.note == null ? null : String(row.note),
    active_yn: row.active_yn === 'N' ? 'N' : 'Y',
    item_count: num(row.item_count),
    day_count: num(row.day_count),
    mod_at: row.mod_at == null ? null : String(row.mod_at),
    created_at: row.created_at == null ? null : String(row.created_at),
  }
}

export async function getMealPlanTemplates(filter: { price_tier?: number | ''; meal_plan_type?: number | '' } = {}) {
  const query = new URLSearchParams()
  if (filter.price_tier !== undefined && filter.price_tier !== '') query.set('price_tier', String(filter.price_tier))
  if (filter.meal_plan_type !== undefined && filter.meal_plan_type !== '') query.set('meal_plan_type', String(filter.meal_plan_type))
  const rows = await readJson<Array<Record<string, unknown>>>(await fetch(buildApiUrl(`/v2/meal-plan-templates?${query}`)), '템플릿 목록을 불러오지 못했습니다.')
  return (Array.isArray(rows) ? rows : []).map(normalizeTemplate)
}

export async function getMealPlanTemplateDetail(id: number): Promise<MealPlanTemplateDetail> {
  const body = await readJson<Record<string, unknown>>(await fetch(buildApiUrl(`/v2/meal-plan-templates/detail?${new URLSearchParams({ meal_plan_template_id: String(id) })}`)), '템플릿을 불러오지 못했습니다.')
  const items = Array.isArray(body.items) ? body.items as Array<Record<string, unknown>> : []
  return {
    ...normalizeTemplate(body),
    items: items.map(item => ({
      template_item_id: num(item.template_item_id),
      day_index: num(item.day_index),
      meal_slot_code: num(item.meal_slot_code),
      meal_slot_name: item.meal_slot_name == null ? undefined : String(item.meal_slot_name),
      sort_order: num(item.sort_order),
      menu_id: String(item.menu_id ?? ''),
      menu_name: String(item.menu_name ?? ''),
      food_type: item.food_type == null ? undefined : num(item.food_type),
      menu_type: item.menu_type == null ? undefined : num(item.menu_type),
      menu_gubun: item.menu_gubun == null ? undefined : num(item.menu_gubun),
      meal_plan_type: item.meal_plan_type == null ? undefined : num(item.meal_plan_type),
      calories_per_serving: item.calories_per_serving == null ? null : num(item.calories_per_serving),
    })),
  }
}

/** 거래처 1일 식단가와 같은 금액대의 템플릿 */
export async function getTemplatesForAccount(accountId: string, mealPlanType?: number): Promise<AccountTemplates> {
  const query = new URLSearchParams({ account_id: accountId })
  if (mealPlanType !== undefined) query.set('meal_plan_type', String(mealPlanType))
  const body = await readJson<Record<string, unknown>>(await fetch(buildApiUrl(`/v2/meal-plan-templates/for-account?${query}`)), '거래처 금액대 템플릿을 불러오지 못했습니다.')
  return {
    daily_budget: body.daily_budget == null ? null : num(body.daily_budget),
    budget_breakdown: body.budget_breakdown == null ? null : String(body.budget_breakdown),
    price_tier: body.price_tier == null ? null : num(body.price_tier),
    templates: (Array.isArray(body.templates) ? body.templates as Array<Record<string, unknown>> : []).map(normalizeTemplate),
    message: body.message == null ? undefined : String(body.message),
  }
}

export type MealPlanTemplateSave = {
  meal_plan_template_id?: number
  price_tier: number
  meal_plan_type: number
  template_seq: number
  template_name: string
  note?: string
  active_yn?: 'Y' | 'N'
  items: Array<{ day_index: number; meal_slot_code: number; menu_id: string }>
}

export async function saveMealPlanTemplate(payload: MealPlanTemplateSave) {
  return readJson<{ meal_plan_template_id: number; item_count: number; message: string }>(await fetch(buildApiUrl('/v2/meal-plan-templates'), {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...payload, user_id: getLocalUserId() }),
  }), '템플릿을 저장하지 못했습니다.')
}

export async function deleteMealPlanTemplate(id: number) {
  return readJson<{ message: string }>(await fetch(buildApiUrl('/v2/meal-plan-templates'), {
    method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ meal_plan_template_id: id }),
  }), '템플릿을 삭제하지 못했습니다.')
}

/** 1일 식단가 → 금액대(1,000원 단위 올림) */
export const priceTierOf = (dailyBudget: number) => dailyBudget > 0 ? Math.ceil(dailyBudget / 1000) * 1000 : 0
export const won = (value: number | null | undefined) => value == null ? '-' : `${Math.round(value).toLocaleString('ko-KR')}원`

/** 본사 메뉴의 이 거래처 기준 예상 1인 원가(거래처 메뉴가 아닌 본사 메뉴만) */
export type HqMenuCost = { menu_id: string; menu_cost_per_person: number | null; menu_cost_complete: boolean; menu_cost_reason?: string }
export async function getHqMenuCosts(accountId: string): Promise<HqMenuCost[]> {
  const rows = await readJson<Array<Record<string, unknown>>>(await fetch(buildApiUrl(`/Menu/HqMenuCosts?${new URLSearchParams({ account_id: accountId })}`)), '본사 메뉴 원가를 불러오지 못했습니다.')
  return (Array.isArray(rows) ? rows : []).map(row => ({
    menu_id: String(row.menu_id ?? ''),
    menu_cost_per_person: row.menu_cost_per_person == null ? null : num(row.menu_cost_per_person),
    menu_cost_complete: num(row.menu_cost_complete) === 1,
    menu_cost_reason: row.menu_cost_reason == null ? undefined : String(row.menu_cost_reason),
  }))
}

/** 주간 식단가 정산(끼니별 초과 허용, 주 합계 경고, 특식 초과는 별도). 금액은 1인 기준 */
export type BudgetSummary = {
  meals: Array<{ meal_service_id: number; meal_date: string; weekday?: string; meal_slot_name: string; special_yn: 'Y' | 'N'; special_note?: string | null;
    meal_budget_per_person: number; meal_cost_per_person: number; difference: number; over_budget: boolean; unpriced_ingredient_count: number }>
  days: Array<{ meal_date: string; weekday?: string; budget: number; cost: number }>
  budget_total: number
  cost_total: number
  special_over_total: number
  balance: number
  over_budget: boolean
  unpriced_ingredient_count: number
  message: string
}
export async function getBudgetSummary(accountId: string, tableId: string): Promise<BudgetSummary> {
  return readJson<BudgetSummary>(await fetch(buildApiUrl(`/v2/meal-plans/budget-summary?${new URLSearchParams({ account_id: accountId, table_id: tableId })}`)), '식단가 정산을 불러오지 못했습니다.')
}
