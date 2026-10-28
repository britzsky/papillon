import HeaderBar from '../../components/HeaderBar'
import SideMenuLayout from '../../components/SideMenuLayout'
import { priceTierOf, won } from '../../api/mealPlanTemplates'
import { cellKey, DAYS, planTypeName, useMealPlanTemplates } from '../../features/operations/useMealPlanTemplates'
import { mealPlanTypeOptions } from './menuManagerShared'
import './MealPlanTemplates.css'

/** 본사 금액대 식단표 템플릿(PC). 상태·조회·저장은 useMealPlanTemplates(터치 화면과 공용) */
export default function MealPlanTemplates() {
  const {
    filterTier, setFilterTier, filterType, setFilterType, tiers, groups,
    draft, setDraft, target, setTarget, search, setSearch, message, busy, listOpen, setListOpen,
    slots: SLOTS, dayCount, pickableMenus,
    openNew, openEdit, remove, addMenu, removeMenu, toggleSlot, closeDraft, save,
  } = useMealPlanTemplates()
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
                    <button type="button" className="rd-btn" onClick={closeDraft}>닫기</button>
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
