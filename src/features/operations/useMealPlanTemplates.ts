import { useEffect, useMemo, useState } from 'react'
import { getMenuManagerList, type MenuManagerItem } from '../../api/operations'
import {
  deleteMealPlanTemplate, getMealPlanTemplateDetail, getMealPlanTemplates, priceTierOf, saveMealPlanTemplate, won, type MealPlanTemplate,
} from '../../api/mealPlanTemplates'
import { getMealSlots } from '../../api/mealSlots'
import { normalizeMenuText } from '../tableMeals/useTableMealsWorkspace'
import { mealPlanTypeOptions } from '../../pages/operations/menuManagerShared'

export const DAYS = ['월', '화', '수', '목', '금', '토', '일']
/** 끼니 목록: 본사 끼니 종류(/v2/meal-slots, 사용 중인 것)를 받기 전·실패 시 쓰는 기본값 */
export type SlotOption = { code: number; label: string; main: boolean; active: boolean }
const DEFAULT_SLOTS: SlotOption[] = [
  { code: 0, label: '조식', main: true }, { code: 1, label: '오전간식', main: false }, { code: 2, label: '중식', main: true }, { code: 3, label: '오후간식', main: false },
  { code: 5, label: '석식', main: true }, { code: 6, label: '저녁간식', main: false },
].map(slot => ({ ...slot, active: true }))
export const planTypeName = (type: number) => mealPlanTypeOptions.find(option => Number(option.value) === type)?.text ?? `유형 ${type}`

export type CellMenu = { menu_id: string; menu_name: string }
export type Draft = {
  meal_plan_template_id?: number
  price_tier: string
  meal_plan_type: number
  template_seq: number
  template_name: string
  note: string
  active_yn: 'Y' | 'N'
  cells: Record<string, CellMenu[]>
  slots: number[]
  weekend: boolean
}
export const cellKey = (day: number, slot: number) => `${day}:${slot}`
const emptyDraft = (mains: number[]): Draft => ({ price_tier: '', meal_plan_type: 0, template_seq: 1, template_name: '', note: '', active_yn: 'Y', cells: {}, slots: mains, weekend: false })

/**
 * 본사 금액대 식단표 템플릿(2026-10-22 사용자 결정). 금액대(1일 식단가를 1,000원 단위로 올린 값)·식단유형마다 최대 3개.
 * 거래처 식단표 관리의 '금액대 템플릿 불러오기'에서 거래처 1일 식단가와 같은 금액대만 보인다. 메뉴는 본사 메뉴.
 * PC(MealPlanTemplates)·터치(MealPlanTemplatesTouch) 공용 상태·조회·저장.
 */
export function useMealPlanTemplates() {
  const [templates, setTemplates] = useState<MealPlanTemplate[]>([])
  const [filterTier, setFilterTier] = useState('')
  const [filterType, setFilterType] = useState<number | ''>('')
  const [menus, setMenus] = useState<MenuManagerItem[]>([])
  const [draft, setDraft] = useState<Draft | null>(null)
  const [target, setTarget] = useState<{ day: number; slot: number } | null>(null)
  const [search, setSearch] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [revision, setRevision] = useState(0)
  const [slotOptions, setSlotOptions] = useState<SlotOption[]>(DEFAULT_SLOTS)
  /** 템플릿 목록 칸. 편집을 시작하면 접어서 식단 구성 칸을 넓힌다 */
  const [listOpen, setListOpen] = useState(true)

  useEffect(() => {
    let alive = true
    getMealSlots().then(rows => {
      if (alive && rows.length) setSlotOptions(rows.map(row => ({ code: row.meal_slot_code, label: row.meal_slot_name, main: row.slot_kind === 'MAIN', active: row.active_yn === 'Y' })))
    }).catch(() => { /* 기본 끼니로 계속 */ })
    return () => { alive = false }
  }, [])
  // 기본으로 켜는 끼니 = 본식. 표·체크 상자는 사용 중인 끼니 + 이 템플릿에 이미 있는 끼니(본사 표시 순서)
  const mainCodes = slotOptions.filter(slot => slot.main && slot.active).map(slot => slot.code)
  const slots = slotOptions.filter(slot => slot.active || draft?.slots.includes(slot.code))

  useEffect(() => {
    let alive = true
    getMealPlanTemplates({ price_tier: filterTier ? priceTierOf(Number(filterTier)) : '', meal_plan_type: filterType })
      .then(rows => { if (alive) setTemplates(rows) })
      .catch(error => { if (alive) setMessage(error instanceof Error ? error.message : '템플릿 목록을 불러오지 못했습니다.') })
    return () => { alive = false }
  }, [filterTier, filterType, revision])

  useEffect(() => {
    let alive = true
    getMenuManagerList().then(rows => { if (alive) setMenus(rows) }).catch(() => { if (alive) setMenus([]) })
    return () => { alive = false }
  }, [])

  const tiers = useMemo(() => [...new Set(templates.map(template => template.price_tier))].sort((a, b) => a - b), [templates])
  const groups = useMemo(() => {
    const map = new Map<string, MealPlanTemplate[]>()
    for (const template of templates) {
      const key = `${template.price_tier}:${template.meal_plan_type}`
      map.set(key, [...(map.get(key) ?? []), template])
    }
    return [...map.entries()]
  }, [templates])

  const pickableMenus = useMemo(() => {
    const key = normalizeMenuText(search)
    return menus.filter(menu => !draft || (menu.meal_plan_type ?? 0) === draft.meal_plan_type)
      .filter(menu => !key || normalizeMenuText(menu.menu_name).includes(key)).slice(0, 200)
  }, [menus, search, draft])

  const openNew = () => { setDraft(emptyDraft(mainCodes)); setTarget({ day: 1, slot: mainCodes.includes(2) ? 2 : mainCodes[0] ?? 2 }); setMessage(''); setListOpen(false) }
  const openEdit = async (template: MealPlanTemplate) => {
    setBusy(true); setMessage('')
    try {
      const detail = await getMealPlanTemplateDetail(template.meal_plan_template_id)
      const cells: Record<string, CellMenu[]> = {}
      const used = new Set<number>(mainCodes)
      let weekend = false
      for (const item of detail.items) {
        const key = cellKey(item.day_index, item.meal_slot_code)
        cells[key] = [...(cells[key] ?? []), { menu_id: item.menu_id, menu_name: item.menu_name || item.menu_id }]
        used.add(item.meal_slot_code)
        if (item.day_index > 5) weekend = true
      }
      setDraft({ meal_plan_template_id: detail.meal_plan_template_id, price_tier: String(detail.price_tier), meal_plan_type: detail.meal_plan_type,
        template_seq: detail.template_seq, template_name: detail.template_name, note: detail.note ?? '', active_yn: detail.active_yn,
        cells, slots: [...used].sort((a, b) => a - b), weekend })
      setTarget({ day: 1, slot: 2 })
      setListOpen(false)
    } catch (error) { setMessage(error instanceof Error ? error.message : '템플릿을 불러오지 못했습니다.') }
    finally { setBusy(false) }
  }
  const remove = async (template: MealPlanTemplate) => {
    if (!window.confirm(`'${template.template_name}' 템플릿을 삭제할까요?`)) return
    try { await deleteMealPlanTemplate(template.meal_plan_template_id); setRevision(value => value + 1); if (draft?.meal_plan_template_id === template.meal_plan_template_id) setDraft(null) }
    catch (error) { setMessage(error instanceof Error ? error.message : '템플릿을 삭제하지 못했습니다.') }
  }
  const addMenu = (menu: MenuManagerItem) => {
    if (!draft || !target) return
    const key = cellKey(target.day, target.slot)
    if ((draft.cells[key] ?? []).some(item => item.menu_id === menu.menu_id)) return
    setDraft({ ...draft, cells: { ...draft.cells, [key]: [...(draft.cells[key] ?? []), { menu_id: menu.menu_id, menu_name: menu.menu_name }] } })
  }
  const removeMenu = (key: string, menuId: string) => draft && setDraft({ ...draft, cells: { ...draft.cells, [key]: (draft.cells[key] ?? []).filter(item => item.menu_id !== menuId) } })
  const toggleSlot = (code: number) => draft && setDraft({ ...draft, slots: draft.slots.includes(code) ? draft.slots.filter(value => value !== code) : [...draft.slots, code].sort((a, b) => a - b) })
  const closeDraft = () => { setDraft(null); setListOpen(true) }

  const save = async () => {
    if (!draft) return
    const tier = priceTierOf(Number(draft.price_tier))
    if (!tier) { setMessage('1일 식단가(금액대)를 입력해주세요.'); return }
    if (!draft.template_name.trim()) { setMessage('템플릿 이름을 입력해주세요.'); return }
    const days = draft.weekend ? 7 : 5
    const items = Object.entries(draft.cells).flatMap(([key, list]) => {
      const [day, slot] = key.split(':').map(Number)
      return day <= days && draft.slots.includes(slot) ? list.map(item => ({ day_index: day, meal_slot_code: slot, menu_id: item.menu_id })) : []
    })
    if (!items.length) { setMessage('템플릿에 메뉴를 넣어주세요.'); return }
    setBusy(true); setMessage('')
    try {
      const result = await saveMealPlanTemplate({ meal_plan_template_id: draft.meal_plan_template_id, price_tier: tier, meal_plan_type: draft.meal_plan_type,
        template_seq: draft.template_seq, template_name: draft.template_name.trim(), note: draft.note, active_yn: draft.active_yn, items })
      setDraft({ ...draft, meal_plan_template_id: result.meal_plan_template_id, price_tier: String(tier) })
      setMessage(`저장했습니다 · ${won(tier)} 금액대 ${planTypeName(draft.meal_plan_type)} ${draft.template_seq}번 · 메뉴 ${result.item_count}개`)
      setRevision(value => value + 1)
    } catch (error) { setMessage(error instanceof Error ? error.message : '템플릿을 저장하지 못했습니다.') }
    finally { setBusy(false) }
  }

  const dayCount = draft?.weekend ? 7 : 5
  return {
    filterTier, setFilterTier, filterType, setFilterType, tiers, groups,
    draft, setDraft, target, setTarget, search, setSearch, message, busy, listOpen, setListOpen,
    slots, dayCount, pickableMenus,
    openNew, openEdit, remove, addMenu, removeMenu, toggleSlot, closeDraft, save,
  }
}
