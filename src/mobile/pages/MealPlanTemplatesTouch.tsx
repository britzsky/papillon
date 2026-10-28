import TouchLayout from '../TouchLayout'
import TouchIcon from '../TouchIcon'
import { priceTierOf, won } from '../../api/mealPlanTemplates'
import { cellKey, DAYS, planTypeName, useMealPlanTemplates } from '../../features/operations/useMealPlanTemplates'
import { mealPlanTypeOptions } from '../../pages/operations/menuManagerShared'
// 편집기 칸·메뉴 패널 모양은 식단표 만들기(터치)와 같게(tc-*)
import './TableMealsCreateTouch.css'
import './MealPlanTemplatesTouch.css'
import TouchSelect from '../TouchSelect'

type T = ReturnType<typeof useMealPlanTemplates>

/**
 * 템플릿 식단표(태블릿·휴대폰, 본사). 목록(금액대·식단유형별 카드) → 편집(정보 → 요일 탭 → 끼니 칸을 누르고 오른쪽 패널에서 본사 메뉴 넣기 → 저장).
 * 로직은 PC 템플릿 식단표 관리와 같은 useMealPlanTemplates.
 */
export default function MealPlanTemplatesTouch() {
  const t = useMealPlanTemplates()
  return t.draft ? <Editor t={t} /> : <List t={t} />
}

function List({ t }: { t: T }) {
  const toolbar = <button type="button" className="t-btn is-primary" onClick={t.openNew}>새 템플릿</button>
  return <TouchLayout title="템플릿 식단표" subtitle="본사 1일 식단가별 식단표" toolbar={toolbar} hideAccount>
    {t.message && <p className="t-msg is-warn" role="status">{t.message}</p>}
    <div className="mt-filters">
      <label className="t-chip t-chip--select"><span className="mt-filters__label">금액대</span>
        <TouchSelect value={t.filterTier} onChange={e => t.setFilterTier(e.target.value)}>
          <option value="">전체</option>{t.tiers.map(tier => <option key={tier} value={tier}>{won(tier)}</option>)}
        </TouchSelect></label>
      <label className="t-chip t-chip--select"><span className="mt-filters__label">식단유형</span>
        <TouchSelect value={t.filterType} onChange={e => t.setFilterType(e.target.value === '' ? '' : Number(e.target.value))}>
          <option value="">전체</option>{mealPlanTypeOptions.map(option => <option key={option.value} value={option.value}>{option.text}</option>)}
        </TouchSelect></label>
    </div>
    {t.groups.length === 0 && <p className="t-msg">템플릿이 없습니다. '새 템플릿'으로 만드세요.</p>}
    {t.groups.map(([key, list]) => <section key={key} className="mt-group">
      <h2 className="t-section-title">{won(list[0].price_tier)} · {planTypeName(list[0].meal_plan_type)} <small>{list.length}/3</small></h2>
      <div className="mt-cards">{list.map(template => <article key={template.meal_plan_template_id} className="t-card mt-card">
        <button type="button" className="mt-card__open" disabled={t.busy} onClick={() => void t.openEdit(template)}>
          <span className="t-dot">{template.template_seq}</span>
          <span className="mt-card__text"><strong>{template.template_name}</strong>
            <small>{template.day_count}일 · 메뉴 {template.item_count}개</small></span>
          {template.active_yn === 'N' ? <span className="t-badge">사용 안 함</span> : <TouchIcon name="chevronRight" />}
        </button>
        <button type="button" className="t-btn is-small is-ghost" onClick={() => void t.remove(template)}>삭제</button>
      </article>)}</div>
    </section>)}
  </TouchLayout>
}

function Editor({ t }: { t: T }) {
  const draft = t.draft!
  const day = t.target?.day ?? 1
  const shown = t.slots.filter(slot => draft.slots.includes(slot.code))
  const targetSlot = t.slots.find(slot => slot.code === t.target?.slot)
  const tier = priceTierOf(Number(draft.price_tier))
  const pickDay = (index: number) => t.setTarget({ day: index, slot: shown.some(slot => slot.code === t.target?.slot) ? t.target!.slot : shown[0]?.code ?? 2 })
  const set = (patch: Partial<typeof draft>) => t.setDraft({ ...draft, ...patch })

  const aside = <div className="tc-panel">
    <div className="tc-panel__head">
      <h2>메뉴 넣기</h2>
      <p>{targetSlot ? `${DAYS[day - 1]}요일 · ${targetSlot.label} 칸에 넣습니다` : '왼쪽에서 칸을 먼저 고르세요'}</p>
      <label className="t-chip tc-search"><TouchIcon name="search" /><input type="search" value={t.search} placeholder="본사 메뉴 검색" onChange={e => t.setSearch(e.target.value)} /></label>
    </div>
    <ul className="tc-menus">{t.pickableMenus.map(menu => <li key={menu.menu_id}>
      <button type="button" disabled={!t.target} onClick={() => t.addMenu(menu)}>
        <strong>{menu.menu_name}</strong>
        <small>{[menu.meal_category, menu.calories_per_serving ? `${menu.calories_per_serving}kcal` : ''].filter(Boolean).join(' · ')}</small>
        <span aria-hidden="true">＋</span>
      </button>
    </li>)}</ul>
    {t.pickableMenus.length === 0 && <p className="tc-hint tc-panel__empty">이 식단유형의 본사 메뉴가 없습니다.</p>}
    <div className="tc-panel__actions">
      <button type="button" className="t-btn is-primary is-large is-block" disabled={t.busy} onClick={() => void t.save()}>{t.busy ? '저장 중…' : '템플릿 저장'}</button>
    </div>
  </div>

  const toolbar = <button type="button" className="t-btn" onClick={t.closeDraft}><TouchIcon name="chevronLeft" />목록으로</button>
  return <TouchLayout title={draft.meal_plan_template_id ? '템플릿 고치기' : '새 템플릿'} subtitle={draft.template_name || undefined} toolbar={toolbar} aside={aside} hideAccount>
    {t.message && <p className="t-msg is-warn tc-msg" role="status">{t.message}</p>}

    <section className="t-card mt-meta" aria-label="템플릿 정보">
      <label className="mt-field">1일 식단가 <small>{tier ? `${won(tier - 999)}~${won(tier)}` : '본식 1인 합계'}</small>
        <input type="number" inputMode="numeric" min="1000" step="1000" value={draft.price_tier} placeholder="13000" onChange={e => set({ price_tier: e.target.value })} /></label>
      <label className="mt-field">식단유형
        <TouchSelect value={draft.meal_plan_type} onChange={e => set({ meal_plan_type: Number(e.target.value) })}>{mealPlanTypeOptions.map(option => <option key={option.value} value={option.value}>{option.text}</option>)}</TouchSelect></label>
      <label className="mt-field">순번
        <TouchSelect value={draft.template_seq} onChange={e => set({ template_seq: Number(e.target.value) })}>{[1, 2, 3].map(value => <option key={value} value={value}>{value}번</option>)}</TouchSelect></label>
      <label className="mt-field is-wide">이름<input value={draft.template_name} maxLength={100} placeholder="예: 13,000원 일반식 A" onChange={e => set({ template_name: e.target.value })} /></label>
      <label className="mt-field is-wide">메모<input value={draft.note} maxLength={300} placeholder="선택" onChange={e => set({ note: e.target.value })} /></label>
      <div className="mt-options is-wide">
        <span className="mt-options__label">식사</span>
        <div className="tc-chips tc-chips--small">
          {t.slots.map(slot => <button key={slot.code} type="button" aria-pressed={draft.slots.includes(slot.code)} className={draft.slots.includes(slot.code) ? 'is-active' : ''} onClick={() => t.toggleSlot(slot.code)}>{slot.label}</button>)}
          <button type="button" aria-pressed={draft.weekend} className={draft.weekend ? 'is-active' : ''} onClick={() => set({ weekend: !draft.weekend })}>주말 포함</button>
          <button type="button" aria-pressed={draft.active_yn === 'Y'} className={draft.active_yn === 'Y' ? 'is-active' : ''} onClick={() => set({ active_yn: draft.active_yn === 'Y' ? 'N' : 'Y' })}>거래처에 보이기</button>
        </div>
      </div>
    </section>

    <div className="t-tabs" role="tablist" aria-label="요일">{DAYS.slice(0, t.dayCount).map((label, i) => {
      const count = shown.reduce((sum, slot) => sum + (draft.cells[cellKey(i + 1, slot.code)] ?? []).length, 0)
      return <button key={label} type="button" role="tab" aria-selected={day === i + 1} className={`t-tab${day === i + 1 ? ' is-active' : ''}`} onClick={() => pickDay(i + 1)}>
        <TouchIcon name="calendar" /><strong>{label}요일</strong><small>{count}개</small>
      </button>
    })}</div>

    {shown.length === 0 && <p className="t-msg">위 '식사'에서 넣을 끼니를 고르세요.</p>}
    <div className="tc-slots">{shown.map(slot => {
      const key = cellKey(day, slot.code)
      const items = draft.cells[key] ?? []
      const active = t.target?.day === day && t.target.slot === slot.code
      return <article key={slot.code} className={`t-card tc-slot${active ? ' is-selected' : ''}`} onClick={() => t.setTarget({ day, slot: slot.code })}>
        <header>
          <h3>{slot.label}</h3>
          {active ? <span className="t-badge is-accent">여기에 넣는 중</span> : <span className="t-badge">눌러서 고르기</span>}
        </header>
        <ul>{items.map(item => <li key={item.menu_id}>
          <span>{item.menu_name}</span>
          <button type="button" aria-label={`${item.menu_name} 빼기`} onClick={e => { e.stopPropagation(); t.removeMenu(key, item.menu_id) }}><TouchIcon name="close" size={16} /></button>
        </li>)}</ul>
        {items.length === 0 && <p className="tc-hint">비어 있습니다. 이 칸을 고르고 오른쪽에서 메뉴를 누르세요.</p>}
      </article>
    })}</div>
  </TouchLayout>
}
