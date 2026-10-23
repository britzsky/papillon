import { buildApiUrl } from '../config/api'
import { getLocalUserId } from './inventory'

/**
 * 끼니 종류(2026-10-23 본사가 추가): 기본 0 조식 ~ 8 킨더간식, 9부터 본사가 추가. 본식(MAIN)/간식(SNACK) 구분이
 * 1일 식단가 나누기·금액대 템플릿·자동 식단 기본 분류를 정한다. 조회는 모두, 추가·수정·순서는 본사만.
 */
export type MealSlotKind = 'MAIN' | 'SNACK'
export type MealSlot = { meal_slot_code: number; meal_slot_name: string; slot_kind: MealSlotKind; display_order: number; active_yn: 'Y' | 'N'; account_count: number }

/** 서버가 구분을 주지 않던 예전 응답·기본 끼니의 본식 판정(조·중·석식) */
const DEFAULT_MAIN_CODES = [0, 2, 5]
export const DEFAULT_SLOT_NAMES: Record<number, string> = { 0: '조식', 1: '오전간식', 2: '중식', 3: '오후간식', 4: 'DC', 5: '석식', 6: '저녁간식', 7: '기타간식', 8: '킨더간식' }
export const slotKindOf = (code: number, kind?: string | null): MealSlotKind =>
  kind === 'MAIN' || kind === 'SNACK' ? kind : DEFAULT_MAIN_CODES.includes(code) ? 'MAIN' : 'SNACK'
export const isMainSlot = (code: number, kind?: string | null) => slotKindOf(code, kind) === 'MAIN'

async function readJson<T>(response: Response, fallback: string): Promise<T> {
  const text = await response.text()
  const body = text ? JSON.parse(text) : null
  if (!response.ok) throw new Error((body as { message?: string } | null)?.message || fallback)
  return body as T
}

export async function getMealSlots(): Promise<MealSlot[]> {
  const rows = await readJson<Array<Record<string, unknown>>>(await fetch(buildApiUrl('/v2/meal-slots')), '끼니 종류를 불러오지 못했습니다.')
  return (Array.isArray(rows) ? rows : []).map(row => {
    const code = Number(row.meal_slot_code ?? 0)
    return {
      meal_slot_code: code,
      meal_slot_name: String(row.meal_slot_name ?? DEFAULT_SLOT_NAMES[code] ?? `끼니 ${code}`),
      slot_kind: slotKindOf(code, row.slot_kind as string),
      display_order: Number(row.display_order ?? code),
      active_yn: row.active_yn === 'N' ? 'N' : 'Y',
      account_count: Number(row.account_count ?? 0),
    }
  })
}

const send = (method: string, path: string, body: object, fallback: string) =>
  fetch(buildApiUrl(path), { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, user_id: getLocalUserId() }) })
    .then(response => readJson<{ message?: string; meal_slot_code?: number }>(response, fallback))

export const createMealSlot = (meal_slot_name: string, slot_kind: MealSlotKind) =>
  send('POST', '/v2/meal-slots', { meal_slot_name, slot_kind }, '끼니를 추가하지 못했습니다.')
export const updateMealSlot = (slot: Pick<MealSlot, 'meal_slot_code' | 'meal_slot_name' | 'slot_kind' | 'active_yn'>) =>
  send('PUT', '/v2/meal-slots', slot, '끼니를 저장하지 못했습니다.')
export const reorderMealSlots = (codes: number[]) =>
  send('POST', '/v2/meal-slots/order', { meal_slot_codes: codes }, '끼니 순서를 저장하지 못했습니다.')
