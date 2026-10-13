import { useState } from 'react'
import TouchLayout from '../TouchLayout'
import TouchIcon from '../TouchIcon'
import MenuThumbnail from '../../pages/operations/MenuThumbnail'
import IngredientSearchSelect from '../../pages/operations/IngredientSearchSelect'
import FavoriteListModal from '../../pages/operations/FavoriteListModal'
import MenuLikeConfirmModal from '../../pages/operations/MenuLikeConfirmModal'
import IngredientLikeConfirmModal from '../../pages/operations/IngredientLikeConfirmModal'
import MenuAliasList from '../../components/MenuAliasList'
import RecipeViewModal from '../../components/RecipeViewModal'
import RecipeRegisterModal from '../../components/RecipeRegisterModal'
import { accountIngredientCost, useAccountMenuManager } from '../../features/operations/useAccountMenuManager'
import { mealCategoryOptions, mealPlanTypeOptions, menuGubunOptions, menuTypeOptions, qtyUnitOptions } from '../../pages/operations/menuManagerShared'
import { planningCostSourceLabels } from '../../utils/planningCost'
import type { MenuManagerItem } from '../../api/operations'
import './AccountMenuTouch.css'

type View = 'mine' | 'add'
const PAGE = 48
const won = (value: number) => `${Math.round(value).toLocaleString('ko-KR')}원`
const optionText = (options: readonly { value: string; text: string }[], value: unknown) => options.find(o => o.value === String(value))?.text || ''

/**
 * 거래처 메뉴(태블릿·휴대폰): 위 거래처 → '우리 메뉴'(담긴 메뉴·1인 원가) / '메뉴 담기'(본사 메뉴에서 골라 담기),
 * 오른쪽에서 고른 메뉴의 분류·레시피 식자재·사용상품·원가를 고치고 저장. 로직은 PC와 같은 useAccountMenuManager.
 * 즐겨찾기·좋아요·AI 레시피 창은 PC 창을 그대로 쓴다.
 */
export default function AccountMenuTouch() {
  const m = useAccountMenuManager()
  const [view, setView] = useState<View>('mine')
  const [category, setCategory] = useState('')
  const [limit, setLimit] = useState(PAGE)
  const [showAlias, setShowAlias] = useState(false)

  const mine = m.assignedMenus.filter(item => (!category || item.meal_category === category)
    && (!m.keywordFilter.trim() || `${item.menu_name}`.toLowerCase().includes(m.keywordFilter.trim().toLowerCase())))
  const assignedIds = new Set(m.assignedMenus.map(item => item.menu_id))
  const costOf = (item: MenuManagerItem) => {
    if (item.menu_id === m.activeMenu?.menu_id) return { value: m.activeMenuCost.total, complete: !m.isDetailLoading && m.activeDetailItems.length > 0 && m.activeMenuCost.missingCount === 0 }
    const value = item.menu_cost_per_person ?? 0
    return { value, complete: item.menu_cost_complete !== false && value > 0 }
  }
  const chooseCategory = (value: string) => { setCategory(value); m.setSelectedMealCategory(value); setLimit(PAGE) }

  const toolbar = <>
    <label className="t-chip am-search">
      <TouchIcon name="search" />
      <input type="search" value={m.keywordFilter} placeholder="메뉴 검색" onChange={e => { m.setKeywordFilter(e.target.value); setLimit(PAGE) }} />
    </label>
    <button type="button" className="t-btn is-soft" disabled={m.isMenuLoading || m.isSaving} onClick={() => void m.handleOpenFavoriteMenuModal()}>나만의 메뉴</button>
    <button type="button" className="t-btn is-soft" disabled={m.isSaving} onClick={() => void m.handleOpenFavoriteIngredientModal()}>나만의 식자재</button>
  </>

  const menu = m.activeMenu
  const assigned = menu ? assignedIds.has(menu.menu_id) : false
  const aside = !m.selectedAccountId ? undefined : <div className="am-panel">
    {menu ? <>
      <div className="am-panel__head">
        <span className="am-panel__img"><MenuThumbnail src={menu.image_url} name={menu.menu_name} /></span>
        <div>
          <h2>{menu.menu_name || menu.menu_id}</h2>
          <p>{menu.meal_category || '분류 없음'}{assigned ? '' : ' · 아직 담지 않은 메뉴'}</p>
        </div>
      </div>
      <div className="am-panel__body">
        <div className={`am-cost${m.activeMenuCost.missingCount > 0 ? ' is-incomplete' : ''}`}>
          <span>예상 1인 원가</span>
          <strong>{won(m.activeMenuCost.total)}</strong>
          <small>{m.activeMenuCost.missingCount > 0 ? `미산정 식자재 ${m.activeMenuCost.missingCount}개` : '산정 완료'}</small>
        </div>
        {assigned && <>
          <span className="am-label">메뉴유형</span>
          <div className="am-chips">{menuTypeOptions.map(option => <button key={option.value} type="button" className={String(menu.menu_type) === option.value ? 'is-active' : ''} onClick={() => m.handleAssignedMenuChange(menu.menu_id, 'menu_type', option.value)}>{option.text}</button>)}</div>
          <div className="am-pair">
            <label className="am-field">메뉴구분<select value={String(menu.menu_gubun ?? '')} onChange={e => m.handleAssignedMenuChange(menu.menu_id, 'menu_gubun', e.target.value)}>
              <option value="">선택</option>{menuGubunOptions.map(o => <option key={o.value} value={o.value}>{o.text}</option>)}
            </select></label>
            <label className="am-field">식단유형<select value={menu.meal_plan_type ?? 0} onChange={e => m.handleAssignedMenuChange(menu.menu_id, 'meal_plan_type', Number(e.target.value))}>
              {mealPlanTypeOptions.map(o => <option key={o.value} value={o.value}>{o.text}</option>)}
            </select></label>
            <label className="am-field">열량(kcal)<input type="text" inputMode="decimal" value={menu.calories_per_serving ?? 0} onChange={e => m.handleAssignedMenuChange(menu.menu_id, 'calories_per_serving', Number(e.target.value.replace(/[^0-9.]/g, '')) || 0)} /></label>
          </div>
        </>}

        <div className="am-ings-head">
          <h3>식자재 {m.activeDetailItems.length}개</h3>
          <button type="button" className="t-btn is-small is-soft" disabled={m.isDetailLoading || m.isRefreshingProducts} onClick={() => void m.refreshLinkedProducts()}>{m.isRefreshingProducts ? '새로고침 중…' : '사용상품 새로고침'}</button>
          <button type="button" className="t-btn is-small" onClick={() => { m.setRecipeViewMode('ai'); m.setRecipeViewRequest(m.buildRecipeRequest(menu)) }}>AI 레시피</button>
        </div>
        {m.isDetailLoading && <p className="am-hint" role="status">식자재를 불러오는 중…</p>}
        {m.detailError && <p className="t-msg is-error">{m.detailError}</p>}
        {m.ingredientError && <p className="t-msg is-warn">{m.ingredientError}</p>}
        <ul className="am-ings">{m.activeDetailItems.map(item => {
          const cost = accountIngredientCost(item)
          return <li key={item.row_id} className="t-pc-embed">
            <div className="am-ings__pick">
              <select aria-label="분류" value={item.category_name ?? ''} onChange={e => m.handleIngredientCategoryChange(menu.menu_id, item.row_id, e.target.value)}>
                <option value="">분류</option>{m.ingredientCategoryOptions.map(option => <option key={option} value={option}>{option}</option>)}
              </select>
              <IngredientSearchSelect options={m.ingredientOptions.filter(o => !item.category_name || o.category_name === item.category_name)}
                placeholder="식자재 선택" selectedName={item.ingredient_name} value={item.ingredient_id} onChange={id => m.handleIngredientSelect(menu.menu_id, item.row_id, id)} />
              <button type="button" className="am-like" aria-label="나만의 식자재" disabled={!item.ingredient_id} onClick={() => item.ingredient_id && m.setLikeTargetIngredientId(item.ingredient_id)}>
                {(item.like ?? m.ingredientOptions.find(o => o.ingredient_id === item.ingredient_id)?.like) === 'Y' ? '♥' : '♡'}
              </button>
            </div>
            <p className={`am-product${item.product_name ? '' : ' is-missing'}`}>{item.product_name || '상품 연결 필요'}{item.supplier_name ? ` · ${item.supplier_name}` : ''}</p>
            <div className="am-ings__qty">
              <input type="text" inputMode="decimal" aria-label="1인분 사용량" value={item.qty_num ?? item.required_qty} onChange={e => m.handleIngredientQtyChange(menu.menu_id, item.row_id, e.target.value.replace(/[^0-9.]/g, ''))} />
              <select aria-label="단위" value={item.qty_unit ?? ''} onChange={e => m.handleIngredientUnitChange(menu.menu_id, item.row_id, e.target.value)}>
                <option value="">단위</option>{qtyUnitOptions.map(unit => <option key={unit} value={unit}>{unit}</option>)}
              </select>
              <span className={`am-ings__cost${cost == null ? ' is-missing' : ''}`}>
                {cost == null ? '원가 확인 필요' : won(cost)}
                {item.cost_source && <small>{planningCostSourceLabels[item.cost_source] ?? item.cost_source}</small>}
              </span>
            </div>
          </li>
        })}</ul>
        <button type="button" className="t-btn is-soft is-block" onClick={m.handleAddIngredient}><span aria-hidden="true">＋</span>식자재 추가</button>
        <button type="button" className="t-btn is-ghost is-block am-alias-toggle" onClick={() => setShowAlias(v => !v)}>{showAlias ? 'PDF 메뉴 별칭 닫기' : 'PDF 메뉴 별칭 보기'}</button>
        {showAlias && <div className="t-pc-embed am-alias"><MenuAliasList accountId={m.selectedAccountId} menuId={menu.menu_id} /></div>}
        {assigned && <button type="button" className="t-btn is-danger is-block" onClick={() => m.handleRemoveAssignedMenu(menu.menu_id)}>이 거래처에서 메뉴 빼기</button>}
        {!assigned && <button type="button" className="t-btn is-primary is-block" onClick={() => m.handleAssignMenu(menu.menu_id)}>이 거래처에 메뉴 담기</button>}
      </div>
    </> : <div className="am-panel__body"><p className="am-hint">메뉴를 고르면 식자재·원가가 여기에 나옵니다.</p></div>}
    <div className="am-panel__actions">
      {m.alert && <p className={`t-msg ${m.alert.type === 'error' ? 'is-error' : 'am-ok'}`} role="status" onClick={() => m.setAlert(null)}>{m.alert.message}</p>}
      <button type="button" className="t-btn is-primary is-large is-block" disabled={!m.selectedAccountId || m.isSaving} onClick={() => void m.handleSave()}>{m.isSaving ? '저장 중…' : '저장'}</button>
    </div>
  </div>

  return <TouchLayout title="거래처 메뉴" subtitle={m.selectedAccountName || undefined} toolbar={toolbar} aside={aside} onAccountChange={value => m.setSelectedAccountId(value)}>
    <div className="t-segment t-method" role="tablist" aria-label="보기">
      <button type="button" className={view === 'mine' ? 'is-active' : ''} onClick={() => { setView('mine'); setLimit(PAGE) }}>우리 메뉴 {m.assignedMenus.length}개</button>
      <button type="button" className={view === 'add' ? 'is-active' : ''} onClick={() => { setView('add'); setLimit(PAGE) }}>메뉴 담기 (본사 메뉴)</button>
    </div>
    <div className="t-tabs" role="tablist" aria-label="식사분류">
      {['', ...mealCategoryOptions].map(value => <button key={value || 'all'} type="button" role="tab" aria-selected={category === value}
        className={`t-tab am-cat${category === value ? ' is-active' : ''}`} onClick={() => chooseCategory(value)}>
        <TouchIcon name="meals" /><strong>{value || '전체'}</strong>
        <small>{(view === 'mine' ? m.assignedMenus : m.filteredMenuItems).filter(item => !value || item.meal_category === value).length}개</small>
      </button>)}
    </div>

    {!m.selectedAccountId && <p className="t-msg">위에서 거래처를 고르면 메뉴가 나옵니다.</p>}
    {m.accountError && <p className="t-msg is-error">{m.accountError}</p>}
    {m.accountMenuError && <p className="t-msg is-error">{m.accountMenuError}</p>}
    {m.menuError && <p className="t-msg is-error">{m.menuError}</p>}

    {view === 'mine' && m.selectedAccountId && <>
      {m.removedAssignedMenus.length > 0 && <div className="am-removed">
        <strong>저장하면 빠지는 메뉴 {m.removedAssignedMenus.length}개</strong>
        {m.removedAssignedMenus.map(item => <button key={item.menu_id} type="button" className="t-btn is-small" onClick={() => m.handleRestoreRemovedMenu(item.menu_id)}>{item.menu_name || item.menu_id} 되돌리기</button>)}
      </div>}
      {m.isAccountMenuLoading && <p className="t-msg" role="status">거래처 메뉴를 불러오는 중…</p>}
      {!m.isAccountMenuLoading && mine.length === 0 && <p className="t-msg">담긴 메뉴가 없습니다. '메뉴 담기'에서 본사 메뉴를 골라 담으세요.</p>}
      <div className="am-grid">{mine.slice(0, limit).map(item => {
        const cost = costOf(item)
        return <button key={item.menu_id} type="button" className={`t-card am-card${item.menu_id === menu?.menu_id ? ' is-selected' : ''}`} onClick={() => m.setSelectedMenuId(item.menu_id)}>
          <span className="am-card__img"><MenuThumbnail src={item.image_url} name={item.menu_name} /></span>
          {item.like === 'Y' && <span className="am-card__like" aria-label="나만의 메뉴">♥</span>}
          <strong>{item.menu_name || '-'}</strong>
          <span className="am-card__tags">{item.meal_category && <span className="t-badge">{item.meal_category}</span>}{optionText(menuTypeOptions, item.menu_type) && <span className="t-badge is-accent">{optionText(menuTypeOptions, item.menu_type)}</span>}</span>
          <span className={`am-card__cost${cost.complete ? '' : ' is-missing'}`}>{cost.complete ? `1인 ${won(cost.value)}` : '원가 미산정'}</span>
        </button>
      })}</div>
      {mine.length > limit && <button type="button" className="t-btn is-soft is-block am-more" onClick={() => setLimit(v => v + PAGE)}>더 보기 ({mine.length - limit}개 남음)</button>}
    </>}

    {view === 'add' && m.selectedAccountId && <>
      {m.selectedAvailableAssignableMenuIds.length > 0 && <div className="am-bulk">
        <span>{m.selectedAvailableAssignableMenuIds.length}개 골랐습니다</span>
        <button type="button" className="t-btn is-primary" onClick={m.handleAssignSelectedMenus}>고른 메뉴 한 번에 담기</button>
      </div>}
      {m.isMenuLoading && <p className="t-msg" role="status">본사 메뉴를 불러오는 중…</p>}
      <div className="am-grid">{m.filteredMenuItems.slice(0, limit).map(item => {
        const isIn = assignedIds.has(item.menu_id)
        const picked = m.selectedAvailableMenuIds.includes(item.menu_id)
        return <div key={item.menu_id} className={`t-card am-card am-card--add${picked ? ' is-selected' : ''}`}>
          <button type="button" className="am-card__open" onClick={() => m.setSelectedMenuId(item.menu_id)}>
            <span className="am-card__img"><MenuThumbnail src={item.image_url} name={item.menu_name} /></span>
            <strong>{item.menu_name || '-'}</strong>
            <span className="am-card__tags">{item.meal_category && <span className="t-badge">{item.meal_category}</span>}</span>
          </button>
          {isIn ? <span className="t-badge is-ok am-card__in">담김</span> : <div className="am-card__actions">
            <button type="button" className={`so-check${picked ? ' is-on' : ''}`} aria-pressed={picked} aria-label={`${item.menu_name} 고르기`} onClick={() => m.handleToggleAvailableMenu(item.menu_id)}>{picked ? <TouchIcon name="check" size={18} /> : null}</button>
            <button type="button" className="t-btn is-small is-soft" onClick={() => m.handleAssignMenu(item.menu_id)}>담기</button>
          </div>}
        </div>
      })}</div>
      {m.filteredMenuItems.length > limit && <button type="button" className="t-btn is-soft is-block am-more" onClick={() => setLimit(v => v + PAGE)}>더 보기 ({m.filteredMenuItems.length - limit}개 남음)</button>}
    </>}

    {m.likeTargetMenu && <MenuLikeConfirmModal isSaving={m.isSavingLike} menu={m.likeTargetMenu} onCancel={() => m.setLikeTargetMenuId(null)} onConfirm={() => void m.handleLikeMenu()} />}
    {m.likeTargetIngredient && <IngredientLikeConfirmModal isSaving={m.isSavingLike} ingredient={m.likeTargetIngredient} onCancel={() => m.setLikeTargetIngredientId(null)} onConfirm={() => void m.handleLikeIngredient()} />}
    {m.isFavoriteMenuModalOpen && <FavoriteListModal type="menu" title="나만의 메뉴" isLoading={m.isFavoriteMenuLoading} items={m.favoriteMenuItems} onClose={() => m.setIsFavoriteMenuModalOpen(false)} onSelect={m.handleSelectFavoriteMenu} />}
    {m.isFavoriteIngredientModalOpen && <FavoriteListModal type="ingredient" title="나만의 식자재" isLoading={m.isFavoriteIngredientLoading} items={m.favoriteIngredientItems} onClose={() => m.setIsFavoriteIngredientModalOpen(false)} onSelect={m.handleSelectFavoriteIngredient} />}
    <RecipeViewModal request={m.recipeViewRequest} mode={m.recipeViewMode} onClose={() => m.setRecipeViewRequest(null)} onRegister={request => { m.setRecipeViewRequest(null); m.setRecipeRegisterRequest(request) }} />
    <RecipeRegisterModal request={m.recipeRegisterRequest} onClose={() => m.setRecipeRegisterRequest(null)} />
  </TouchLayout>
}
