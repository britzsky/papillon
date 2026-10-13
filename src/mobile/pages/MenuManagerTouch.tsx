import { useState } from 'react'
import TouchLayout from '../TouchLayout'
import TouchIcon from '../TouchIcon'
import MenuThumbnail from '../../pages/operations/MenuThumbnail'
import IngredientSearchSelect from '../../pages/operations/IngredientSearchSelect'
import RecipeViewModal from '../../components/RecipeViewModal'
import RecipeRegisterModal from '../../components/RecipeRegisterModal'
import { useMenuManager } from '../../features/operations/useMenuManager'
import { isMenuFieldDirty, mealCategoryOptions, mealPlanTypeOptions, menuGubunOptions, menuTypeOptions, qtyUnitOptions } from '../../pages/operations/menuManagerShared'
import type { MenuManagerItem } from '../../api/operations'
import './MenuManagerTouch.css'

const PAGE = 48
const MENU_FIELDS = ['menu_name', 'meal_category', 'menu_type', 'menu_gubun', 'menu_img', 'meal_plan_type', 'calories_per_serving'] as const
const optionText = (options: readonly { value: string; text: string }[], value: unknown) => options.find(o => o.value === String(value))?.text || ''

/**
 * 메뉴 관리(본사 메뉴, 태블릿·휴대폰): 식사분류 칸·조건 → 메뉴 카드(사진), 오른쪽에서 고른 메뉴의 사진·이름·분류·레시피 식자재를 고치고 저장.
 * 로직은 PC 표 편집과 같은 useMenuManager(저장은 바뀐 메뉴·식자재 전체). AI 레시피 보기·등록은 PC 창을 그대로 쓴다.
 */
export default function MenuManagerTouch() {
  const m = useMenuManager()
  const [limit, setLimit] = useState(PAGE)
  const isDirty = (menu: MenuManagerItem) => MENU_FIELDS.some(field => isMenuFieldDirty(menu, m.originalMenusById, field)) || !m.originalMenusById[menu.menu_id]
  const dirtyCount = m.menuItems.filter(isDirty).length
  const countBy = (category: string) => m.menuItems.filter(item => !category || item.meal_category === category).length

  const toolbar = <>
    <label className="t-chip mm-search">
      <TouchIcon name="search" />
      <input type="search" value={m.keywordFilter} placeholder="메뉴명 · 키워드 · 식재료" onChange={e => { m.setKeywordFilter(e.target.value); setLimit(PAGE) }} />
    </label>
    <button type="button" className="t-btn is-primary" onClick={m.handleAddRow}><span aria-hidden="true">＋</span>새 메뉴</button>
  </>

  const menu = m.activeMenu
  const aside = menu ? <div className="mm-panel">
    <div className="mm-panel__head">
      <label className="mm-photo">
        <MenuThumbnail src={menu.image_url} name={menu.menu_name} isDirty={isMenuFieldDirty(menu, m.originalMenusById, 'menu_img')} />
        <span className="t-btn is-small is-soft">사진 바꾸기</span>
        <input type="file" accept="image/*" onChange={e => m.handleMenuImageFileChange(menu.menu_id, e.target.files?.[0] ?? null)} />
      </label>
      <div className="mm-panel__title">
        <input className="mm-name" aria-label="메뉴명" value={menu.menu_name} placeholder="메뉴 이름" onChange={e => m.handleMenuChange(menu.menu_id, 'menu_name', e.target.value)} />
        <small>{menu.menu_id}</small>
      </div>
    </div>
    <div className="mm-panel__body">
      <span className="mm-label">식사분류</span>
      <div className="mm-chips">{mealCategoryOptions.map(option => <button key={option} type="button" className={menu.meal_category === option ? 'is-active' : ''} onClick={() => m.handleMenuChange(menu.menu_id, 'meal_category', option)}>{option}</button>)}</div>
      <span className="mm-label">메뉴유형</span>
      <div className="mm-chips">{menuTypeOptions.map(option => <button key={option.value} type="button" className={String(menu.menu_type) === option.value ? 'is-active' : ''} onClick={() => m.handleMenuChange(menu.menu_id, 'menu_type', option.value)}>{option.text}</button>)}</div>
      <div className="mm-pair">
        <label className="mm-field">메뉴구분<select value={String(menu.menu_gubun ?? '')} onChange={e => m.handleMenuChange(menu.menu_id, 'menu_gubun', e.target.value)}>
          <option value="">선택</option>{menuGubunOptions.map(option => <option key={option.value} value={option.value}>{option.text}</option>)}
        </select></label>
        <label className="mm-field">식단유형<select value={String(menu.meal_plan_type ?? 0)} onChange={e => m.handleMenuNumberChange(menu.menu_id, 'meal_plan_type', e.target.value)}>
          {mealPlanTypeOptions.map(option => <option key={option.value} value={option.value}>{option.text}</option>)}
        </select></label>
        <label className="mm-field">1인분 열량(kcal)<input type="text" inputMode="numeric" value={menu.calories_per_serving ?? ''} onChange={e => m.handleMenuNumberChange(menu.menu_id, 'calories_per_serving', e.target.value.replace(/[^0-9.]/g, ''))} /></label>
      </div>

      <div className="mm-recipe-head">
        <h3>레시피 식자재 {m.activeDetailItems.length}개</h3>
        <button type="button" className="t-btn is-small is-soft" onClick={() => { m.setRecipeViewMode('ai'); m.setRecipeViewRequest(m.buildRecipeRequest(menu)) }}>AI 레시피</button>
        <button type="button" className="t-btn is-small" onClick={() => m.setRecipeRegisterRequest(m.buildRecipeRequest(menu))}>레시피 등록</button>
      </div>
      {m.isDetailLoading && <p className="mm-hint" role="status">식자재를 불러오는 중…</p>}
      {m.detailError && <p className="t-msg is-error">{m.detailError}</p>}
      <ul className="mm-ings">{m.activeDetailItems.map(item => <li key={item.row_id} className="t-pc-embed">
        <div className="mm-ings__pick">
          <select aria-label="분류" value={item.category_name ?? ''} onChange={e => m.handleIngredientCategoryChange(menu.menu_id, item.row_id, e.target.value)}>
            <option value="">분류</option>{m.ingredientCategoryOptions.map(option => <option key={option} value={option}>{option}</option>)}
          </select>
          <IngredientSearchSelect options={item.category_name ? m.ingredientOptions.filter(o => o.category_name === item.category_name) : m.ingredientOptions}
            placeholder="식자재 선택" selectedName={item.ingredient_name} value={item.ingredient_id} onChange={id => m.handleIngredientSelect(menu.menu_id, item.row_id, id)} />
        </div>
        <div className="mm-ings__qty">
          <input type="text" inputMode="decimal" aria-label="1인분 필요량" value={item.required_qty} onChange={e => m.handleIngredientNumberChange(menu.menu_id, item.row_id, 'required_qty', e.target.value.replace(/[^0-9.]/g, ''))} />
          <select aria-label="단위" value={item.qty_unit ?? ''} onChange={e => m.handleIngredientTextChange(menu.menu_id, item.row_id, 'qty_unit', e.target.value)}>
            <option value="">단위</option>{qtyUnitOptions.map(unit => <option key={unit} value={unit}>{unit}</option>)}
          </select>
        </div>
      </li>)}</ul>
      <button type="button" className="t-btn is-soft is-block" onClick={m.handleAddIngredient}><span aria-hidden="true">＋</span>식자재 추가</button>
      {m.alert && <p className={`t-msg ${m.alert.type === 'error' ? 'is-error' : 'mm-ok'}`} role="status" onClick={() => m.setAlert(null)}>{m.alert.message}</p>}
    </div>
    <div className="mm-panel__actions">
      <button type="button" className="t-btn is-primary is-large is-block" disabled={m.isSaving} onClick={() => void m.handleSave()}>{m.isSaving ? '저장 중…' : `저장${dirtyCount ? ` · 바뀐 메뉴 ${dirtyCount}개` : ''}`}</button>
    </div>
  </div> : <div className="mm-panel"><div className="mm-panel__body"><p className="mm-hint">메뉴를 고르면 여기서 고칠 수 있습니다.</p></div></div>

  return <TouchLayout title="메뉴 관리" subtitle={`${m.filteredMenuItems.length}개 메뉴`} toolbar={toolbar} aside={aside} hideAccount>
    <div className="t-tabs" role="tablist" aria-label="식사분류">
      {['', ...mealCategoryOptions].map(category => <button key={category || 'all'} type="button" role="tab" aria-selected={m.selectedMealCategory === category}
        className={`t-tab mm-cat${m.selectedMealCategory === category ? ' is-active' : ''}`} onClick={() => { m.setSelectedMealCategory(category); setLimit(PAGE) }}>
        <TouchIcon name="meals" /><strong>{category || '전체'}</strong><small>{countBy(category)}개</small>
      </button>)}
    </div>
    <div className="mm-filters">
      <label className="t-chip t-chip--select"><select aria-label="메뉴유형" value={m.selectedMenuType} onChange={e => m.setSelectedMenuType(e.target.value)}><option value="">메뉴유형 전체</option>{menuTypeOptions.map(o => <option key={o.value} value={o.value}>{o.text}</option>)}</select></label>
      <label className="t-chip t-chip--select"><select aria-label="메뉴구분" value={m.selectedMenuGubun} onChange={e => m.setSelectedMenuGubun(e.target.value)}><option value="">메뉴구분 전체</option>{menuGubunOptions.map(o => <option key={o.value} value={o.value}>{o.text}</option>)}</select></label>
      <label className="t-chip t-chip--select"><select aria-label="식단유형" value={m.selectedMealPlanType} onChange={e => m.setSelectedMealPlanType(e.target.value)}><option value="">식단유형 전체</option>{mealPlanTypeOptions.map(o => <option key={o.value} value={o.value}>{o.text}</option>)}</select></label>
    </div>

    {m.menuError && <p className="t-msg is-error">{m.menuError}</p>}
    {m.ingredientError && <p className="t-msg is-warn">{m.ingredientError}</p>}
    {m.isMenuLoading && <p className="t-msg" role="status">메뉴를 불러오는 중…</p>}
    {!m.isMenuLoading && !m.menuError && m.filteredMenuItems.length === 0 && <p className="t-msg">조건에 맞는 메뉴가 없습니다.</p>}

    <div className="mm-grid">
      {m.filteredMenuItems.slice(0, limit).map(item => <button key={item.menu_id} type="button" className={`t-card mm-card${item.menu_id === menu?.menu_id ? ' is-selected' : ''}`} onClick={() => m.setSelectedMenuId(item.menu_id)}>
        <span className="mm-card__img"><MenuThumbnail src={item.image_url} name={item.menu_name} /></span>
        {isDirty(item) && <span className="t-badge is-yellow mm-card__dirty">저장 안 됨</span>}
        <strong>{item.menu_name || '(이름 없음)'}</strong>
        <span className="mm-card__tags">
          {item.meal_category && <span className="t-badge">{item.meal_category}</span>}
          {optionText(menuTypeOptions, item.menu_type) && <span className="t-badge is-accent">{optionText(menuTypeOptions, item.menu_type)}</span>}
        </span>
        <small>{optionText(menuGubunOptions, item.menu_gubun)}{item.calories_per_serving ? ` · ${item.calories_per_serving}kcal` : ''}</small>
      </button>)}
    </div>
    {m.filteredMenuItems.length > limit && <button type="button" className="t-btn is-soft is-block mm-more" onClick={() => setLimit(v => v + PAGE)}>더 보기 ({m.filteredMenuItems.length - limit}개 남음)</button>}

    <RecipeViewModal request={m.recipeViewRequest} mode={m.recipeViewMode} onClose={() => m.setRecipeViewRequest(null)}
      onRegister={request => { m.setRecipeViewRequest(null); m.setRecipeRegisterRequest(request) }} />
    <RecipeRegisterModal request={m.recipeRegisterRequest} onClose={() => m.setRecipeRegisterRequest(null)} />
  </TouchLayout>
}
