import { useEffect, useMemo, useState } from 'react'
import HeaderBar from '../../components/HeaderBar'
import SideMenuLayout from '../../components/SideMenuLayout'
import { getMenuManagerList, type MenuManagerItem } from '../../api/operations'
import {
  deleteMealPlanTemplate, getMealPlanTemplateDetail, getMealPlanTemplates, priceTierOf, saveMealPlanTemplate, won, type MealPlanTemplate,
} from '../../api/mealPlanTemplates'
import { getMealSlots } from '../../api/mealSlots'
import { normalizeMenuText } from '../../features/tableMeals/useTableMealsWorkspace'
import { mealPlanTypeOptions } from './menuManagerShared'
import './MealPlanTemplates.css'

const DAYS = ['월', '화', '수', '목', '금', '토', '일']
/** 끼니 목록: 본사 끼니 종류(/v2/meal-slots, 사용 중인 것)를 받기 전·실패 시 쓰는 기본값 */
type SlotOption = { code: number; label: string; main: boolean; active: boolean }
const DEFAULT_SLOTS: SlotOption[] = [
  { code: 0, label: '조식', main: true }, { code: 1, label: '오전간식', main: false }, { code: 2, label: '중식', main: true }, { code: 3, label: '오후간식', main: false },
  { code: 5, label: '석식', main: true }, { code: 6, label: '저녁간식', main: false },
].map(slot => ({ ...slot, active: true }))
const planTypeName = (type: number) => mealPlanTypeOptions.find(option => Number(option.value) === type)?.text ?? `유형 ${type}`

type CellMenu = { menu_id: string; menu_name: string }
type Draft = {
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
const cellKey = (day: number, slot: number) => `${day}:${slot}`
const emptyDraft = (mains: number[]): Draft => ({ price_tier: '', meal_plan_type: 0, template_seq: 1, template_name: '', note: '', active_yn: 'Y', cells: {}, slots: mains, weekend: false })

/**
 * 본사 금액대 식단표 템플릿(2026-10-22 사용자 결정). 금액대(1일 식단가를 1,000원 단위로 올린 값)·식단유형마다 최대 3개.
 * 거래처 식단표 관리의 '금액대 템플릿 불러오기'에서 거래처 1일 식단가와 같은 금액대만 보인다. 메뉴는 본사 메뉴.
 */
export default function MealPlanTemplates() {
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
  const SLOTS = slotOptions.filter(slot => slot.active || draft?.slots.includes(slot.code))

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
      const slots = new Set<number>(mainCodes)
      let weekend = false
      for (const item of detail.items) {
        const key = cellKey(item.day_index, item.meal_slot_code)
        cells[key] = [...(cells[key] ?? []), { menu_id: item.menu_id, menu_name: item.menu_name || item.menu_id }]
        slots.add(item.meal_slot_code)
        if (item.day_index > 5) weekend = true
      }
      setDraft({ meal_plan_template_id: detail.meal_plan_template_id, price_tier: String(detail.price_tier), meal_plan_type: detail.meal_plan_type,
        template_seq: detail.template_seq, template_name: detail.template_name, note: detail.note ?? '', active_yn: detail.active_yn,
        cells, slots: [...slots].sort((a, b) => a - b), weekend })
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
  return <div className="meal-template-page">
    <main>
      <SideMenuLayout header={<HeaderBar title="템플릿 식단표 관리" breadcrumbs={[{ label: 'Home', to: '/home' }, { label: '운영관리', to: '/operations/table-meals' }, { label: '템플릿 식단표 관리' }]} />}>
        <div className="rd rd-page mpt">
          <header className="mpt__head">
            <div>
              <h1 className="rd-h1">템플릿 식단표 관리</h1>
              <p className="rd-muted">1일 식단가(본식 1인 합계, 1,000원 단위로 올림)·식단유형마다 3개까지. 거래처 식단표의 '템플릿 식단표 불러오기'에 같은 금액대만 보입니다(예: 12,900원 → 13,000원).</p>
            </div>
            <button type="button" className="rd-btn is-primary" onClick={openNew}>새 템플릿</button>
          </header>
          {message ? <p className="mpt__message" role="status">{message}</p> : null}
          <div className={`mpt__grid${draft && !listOpen ? ' is-list-closed' : ''}`}>
            {draft && !listOpen ? null : <section className="rd-card mpt__list" aria-label="템플릿 목록">
              <div className="mpt__filters">
                <label>금액대<select value={filterTier} onChange={event => setFilterTier(event.target.value)}>
                  <option value="">전체</option>{tiers.map(tier => <option key={tier} value={tier}>{won(tier)}</option>)}
                </select></label>
                <label>식단유형<select value={filterType} onChange={event => setFilterType(event.target.value === '' ? '' : Number(event.target.value))}>
                  <option value="">전체</option>{mealPlanTypeOptions.map(option => <option key={option.value} value={option.value}>{option.text}</option>)}
                </select></label>
              </div>
              {groups.length === 0 ? <p className="rd-muted">템플릿이 없습니다. '새 템플릿'으로 만드세요.</p> : null}
              {groups.map(([key, list]) => <div key={key} className="mpt__group">
                <h2 className="rd-h2">{won(list[0].price_tier)} · {planTypeName(list[0].meal_plan_type)} <small className="rd-muted">{list.length}/3</small></h2>
                <ul>{list.map(template => <li key={template.meal_plan_template_id} className={draft?.meal_plan_template_id === template.meal_plan_template_id ? 'is-selected' : ''}>
                  <button type="button" className="mpt__item" disabled={busy} onClick={() => void openEdit(template)}>
                    <strong>{template.template_seq}번 · {template.template_name}</strong>
                    <small>{template.day_count}일 · 메뉴 {template.item_count}개{template.active_yn === 'N' ? ' · 사용 안 함' : ''}</small>
                  </button>
                  <button type="button" className="rd-btn is-ghost" onClick={() => void remove(template)}>삭제</button>
                </li>)}</ul>
              </div>)}
            </section>}

            {draft ? <section className="rd-card mpt__editor" aria-label="템플릿 편집">
              {/* 템플릿 정보(1일 식단가·식단유형·순번·이름·메모·식사)는 한 칸에 모으고 아래 식단 구성을 넓게 */}
              <div className="mpt__meta">
                <div className="mpt__meta-row">
                  <label className="mpt__field is-price"><span>1일 식단가 <small>{Number(draft.price_tier) > 0 ? `${won(priceTierOf(Number(draft.price_tier)) - 999)}~${won(priceTierOf(Number(draft.price_tier)))}` : '본식 1인 합계'}</small></span>
                    <input type="number" min="1000" step="1000" value={draft.price_tier} placeholder="13000" onChange={event => setDraft({ ...draft, price_tier: event.target.value })} /></label>
                  <label className="mpt__field">식단유형<select value={draft.meal_plan_type} onChange={event => setDraft({ ...draft, meal_plan_type: Number(event.target.value) })}>{mealPlanTypeOptions.map(option => <option key={option.value} value={option.value}>{option.text}</option>)}</select></label>
                  <label className="mpt__field is-seq">순번<select value={draft.template_seq} onChange={event => setDraft({ ...draft, template_seq: Number(event.target.value) })}>{[1, 2, 3].map(value => <option key={value} value={value}>{value}번</option>)}</select></label>
                  <label className="mpt__field is-name">이름<input value={draft.template_name} maxLength={100} placeholder="예: 13,000원 일반식 A" onChange={event => setDraft({ ...draft, template_name: event.target.value })} /></label>
                  <label className="mpt__field is-note">메모<input value={draft.note} maxLength={300} placeholder="선택" onChange={event => setDraft({ ...draft, note: event.target.value })} /></label>
                </div>
                <div className="mpt__meta-row is-options">
                  <span className="mpt__slots"><b>식사</b>{SLOTS.map(slot => <label key={slot.code}><input type="checkbox" checked={draft.slots.includes(slot.code)} onChange={() => toggleSlot(slot.code)} /> {slot.label}</label>)}
                    <label><input type="checkbox" checked={draft.weekend} onChange={event => setDraft({ ...draft, weekend: event.target.checked })} /> 주말 포함</label></span>
                  <label className="mpt__check"><input type="checkbox" checked={draft.active_yn === 'Y'} onChange={event => setDraft({ ...draft, active_yn: event.target.checked ? 'Y' : 'N' })} /> 거래처에 보이기</label>
                  <span className="mpt__meta-actions">
                    <button type="button" className="rd-btn is-ghost" onClick={() => setListOpen(open => !open)}>{listOpen ? '목록 접기' : '템플릿 목록'}</button>
                    <button type="button" className="rd-btn" onClick={() => { setDraft(null); setListOpen(true) }}>닫기</button>
                    <button type="button" className="rd-btn is-primary" disabled={busy} onClick={() => void save()}>{busy ? '저장 중…' : '템플릿 저장'}</button>
                  </span>
                </div>
              </div>
              <div className="mpt__editor-body">
                <div className="mpt__table-wrap">
                  <table className="mpt__table">
                    <thead><tr><th />{DAYS.slice(0, dayCount).map(day => <th key={day}>{day}</th>)}</tr></thead>
                    <tbody>{SLOTS.filter(slot => draft.slots.includes(slot.code)).map(slot => <tr key={slot.code}>
                      <th>{slot.label}</th>
                      {DAYS.slice(0, dayCount).map((day, index) => {
                        const key = cellKey(index + 1, slot.code)
                        const active = target?.day === index + 1 && target.slot === slot.code
                        return <td key={day} className={active ? 'is-active' : ''} onClick={() => setTarget({ day: index + 1, slot: slot.code })}>
                          <ul>{(draft.cells[key] ?? []).map(item => <li key={item.menu_id}>{item.menu_name}
                            <button type="button" aria-label={`${item.menu_name} 빼기`} onClick={event => { event.stopPropagation(); removeMenu(key, item.menu_id) }}>×</button></li>)}</ul>
                          {(draft.cells[key] ?? []).length === 0 ? <span className="mpt__empty">메뉴 추가</span> : null}
                        </td>
                      })}
                    </tr>)}</tbody>
                  </table>
                </div>
                <aside className="mpt__menus" aria-label="본사 메뉴">
                  <strong>{target ? `${DAYS[target.day - 1]} · ${SLOTS.find(slot => slot.code === target.slot)?.label}` : '칸을 고르세요'}</strong>
                  <input type="search" value={search} placeholder="본사 메뉴 검색" onChange={event => setSearch(event.target.value)} />
                  <ul>{pickableMenus.map(menu => <li key={menu.menu_id}><button type="button" disabled={!target} onClick={() => addMenu(menu)}>{menu.menu_name}
                    {menu.calories_per_serving ? <small>{menu.calories_per_serving}kcal</small> : null}</button></li>)}</ul>
                  {pickableMenus.length === 0 ? <p className="rd-muted">이 식단유형의 본사 메뉴가 없습니다.</p> : null}
                </aside>
              </div>
            </section> : <section className="rd-card mpt__editor mpt__placeholder"><p>왼쪽에서 템플릿을 고르거나 '새 템플릿'을 누르세요. 거래처 식단표 편집기에서 본사 계정은 '템플릿으로 저장'으로도 만들 수 있습니다.</p></section>}
          </div>
        </div>
      </SideMenuLayout>
    </main>
  </div>
}
