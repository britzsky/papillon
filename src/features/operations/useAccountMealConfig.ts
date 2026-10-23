import { useEffect, useState } from 'react'
import {
  getAccountMealConfiguration, getAccountMealSlots, saveAccountMealConfiguration,
  type AccountMealConfiguration, type AccountMealSlot, type AccountMealSlotProfile,
} from '../../api/operations'
import { slotKindOf } from '../../api/mealSlots'

export const FOOD_TYPE_OPTIONS = [[1, '한식'], [2, '중식'], [3, '일식'], [4, '양식'], [5, '분식'], [6, '간식'], [7, '기타']] as const
export const MEAL_PLAN_TYPE_OPTIONS = [[0, '일반식'], [1, '가성비식단'], [2, '요양원맞춤식단'], [3, '테마식단'], [4, '다이어트식단'], [5, '프리미엄식단']] as const
/** 간식 끼니(기본 식사분류가 간식). 본식/간식은 본사 끼니 종류 관리의 구분을 따른다(2026-10-23) */
export const isSnackSlot = (slot: { meal_slot_code: number; slot_kind?: string } | undefined, code: number) => slotKindOf(code, slot?.slot_kind) === 'SNACK'
export const formatBudget = (value?: number | null) => value == null ? '계산 필요' : `${Math.round(value).toLocaleString('ko-KR')}원`

type Loaded = { key: string; mealSlots: AccountMealSlot[]; configuration: AccountMealConfiguration | null; selectedCodes: number[]; profiles: Record<number, AccountMealSlotProfile> }
const EMPTY: Loaded = { key: '', mealSlots: [], configuration: null, selectedCodes: [], profiles: {} }

/**
 * 고객사 식사 설정(PC·터치 공용): 제공하는 식사 구분 고르기·순서, 식사별 기본 분류·식단유형(자동 식단표 기본값), 1인 단가(서버 계산) 보기, 저장.
 * 조회 결과와 편집 상태를 고객사 키와 함께 둔다(고객사를 바꾸면 이전 편집은 안 보인다).
 */
export function useAccountMealConfig(accountId: string) {
  const [state, setState] = useState<Loaded>(EMPTY)
  const [loadingKey, setLoadingKey] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (!accountId) return
    let active = true
    setLoadingKey(accountId); setMessage('')
    void Promise.all([getAccountMealSlots(accountId), getAccountMealConfiguration(accountId)])
      .then(([items, config]) => {
        if (!active) return
        const sorted = [...items].sort((a, b) => a.display_order - b.display_order)
        setState({
          key: accountId, mealSlots: sorted, configuration: config,
          profiles: Object.fromEntries(config.profiles.map((profile) => [profile.meal_slot_code, profile])),
          selectedCodes: sorted.filter((item) => item.selected_yn === 'Y').map((item) => item.meal_slot_code),
        })
      })
      .catch((error) => { if (active) setMessage(error instanceof Error ? error.message : '조회에 실패했습니다.') })
      .finally(() => { if (active) setLoadingKey('') })
    return () => { active = false }
  }, [accountId])

  const current = state.key === accountId && accountId ? state : EMPTY
  const isSnack = (code: number) => isSnackSlot(current.mealSlots.find(item => item.meal_slot_code === code), code)
  const defaultFoodType = (code: number) => (isSnack(code) ? 6 : 1)
  const loading = Boolean(accountId) && loadingKey === accountId
  const edit = (patch: Partial<Loaded>) => setState(prev => prev.key === accountId ? { ...prev, ...patch } : prev)

  const setSelectedCodes = (next: number[] | ((codes: number[]) => number[])) =>
    setState(prev => prev.key === accountId ? { ...prev, selectedCodes: typeof next === 'function' ? next(prev.selectedCodes) : next } : prev)
  const toggleMealSlot = (code: number) => setSelectedCodes(codes => codes.includes(code) ? codes.filter(item => item !== code) : [...codes, code])
  /** 고른 식사 순서를 한 칸 앞(-1)·뒤(+1)로 */
  const moveMealSlot = (code: number, direction: -1 | 1) => setSelectedCodes(codes => {
    const index = codes.indexOf(code)
    const target = index + direction
    if (index < 0 || target < 0 || target >= codes.length) return codes
    const next = [...codes]
    next.splice(index, 1)
    next.splice(target, 0, code)
    return next
  })
  /** 고른 식사 code를 targetCode 자리로(PC 끌어 놓기) */
  const placeMealSlot = (code: number, targetCode: number) => setSelectedCodes(codes => {
    const sourceIndex = codes.indexOf(code)
    const targetIndex = codes.indexOf(targetCode)
    if (sourceIndex < 0 || targetIndex < 0 || code === targetCode) return codes
    const next = [...codes]
    next.splice(sourceIndex, 1)
    next.splice(targetIndex, 0, code)
    return next
  })

  const updateProfile = (code: number, patch: Partial<AccountMealSlotProfile>) => edit({
    profiles: {
      ...current.profiles,
      [code]: {
        ...current.profiles[code],
        meal_slot_code: code,
        default_food_type: current.profiles[code]?.default_food_type ?? defaultFoodType(code),
        default_meal_plan_type: current.profiles[code]?.default_meal_plan_type ?? 0,
        ...patch,
      },
    },
  })

  /** 고른 식사를 먼저(고른 순서), 나머지는 원래 순서 */
  const orderedSlots = [...current.mealSlots].sort((a, b) => {
    const aIndex = current.selectedCodes.indexOf(a.meal_slot_code)
    const bIndex = current.selectedCodes.indexOf(b.meal_slot_code)
    if (aIndex >= 0 && bIndex >= 0) return aIndex - bIndex
    if (aIndex >= 0) return -1
    if (bIndex >= 0) return 1
    return a.display_order - b.display_order
  })

  /** 저장 성공이면 true */
  const save = async () => {
    if (!accountId || current.selectedCodes.length === 0) {
      setMessage('고객사와 하나 이상의 식사구분을 선택해 주세요.')
      return false
    }
    setSaving(true)
    setMessage('')
    try {
      await saveAccountMealConfiguration({
        account_id: accountId,
        meal_slots: current.selectedCodes.map((code, index) => ({
          meal_slot_code: code,
          display_order: index + 1,
          default_food_type: current.profiles[code]?.default_food_type ?? defaultFoodType(code),
          default_meal_plan_type: current.profiles[code]?.default_meal_plan_type ?? 0,
          template_id: current.profiles[code]?.template_id ?? null,
        })),
      })
      const refreshed = await getAccountMealConfiguration(accountId)
      edit({ configuration: refreshed, profiles: Object.fromEntries(refreshed.profiles.map((profile) => [profile.meal_slot_code, profile])) })
      setMessage('급식형식과 기본 식사 구성을 함께 저장했습니다.')
      return true
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '저장에 실패했습니다.')
      return false
    } finally {
      setSaving(false)
    }
  }

  return {
    mealSlots: current.mealSlots, orderedSlots, selectedCodes: current.selectedCodes, configuration: current.configuration, profiles: current.profiles,
    loading, saving, message, setMessage, toggleMealSlot, moveMealSlot, placeMealSlot, updateProfile, save, isSnack,
  }
}
