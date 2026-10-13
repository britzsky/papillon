import { useState } from 'react'
import { Link } from 'react-router-dom'
import { qty, statusLabel, dayLabel, useMealUsage, type Meal } from '../features/mealUsage/useMealUsage'

/**
 * 식단표(주) 사용 확정 — PC 화면. 로직은 features/mealUsage/useMealUsage(모바일과 공용).
 * 재고가 부족하면 확정하지 않고 직접 구매 입력·입고 확정으로 안내한다.
 */
export default function MealUsageControls({ accountId, tableId, onChanged }: { accountId: string; tableId: string; onChanged: () => void }) {
  const {
    meals, allowUnserved, confirmable, completed, reconfirm, upcoming, days, error,
    open, targets, scopeLabel, servings, preview, step, busy, modalError, shortageCount,
    openDialog, closeDialog, changeServings, runPreview, confirmWeek, cancelMeal: cancelUsage, setStep,
  } = useMealUsage(accountId, tableId, onChanged)
  const [showMeals, setShowMeals] = useState(false)

  const cancelMeal = async (meal: Meal) => {
    if (!window.confirm(`${meal.meal_date} ${meal.meal_slot}의 사용 확정을 취소할까요?
차감했던 재고가 원래 상품·LOT로 복원되고, 이 식사는 다시 확정해야 합니다.`)) return
    await cancelUsage(meal)
  }

  return <section className="meal-usage-panel no-print" aria-label="주간 사용 확정">
    <div className="meal-usage-panel__summary">
      <div>
        <strong>주간 사용 확정</strong>
        <span>사용 확정 {completed}/{meals.length}식 · 확정 대기 {confirmable.length}식{upcoming ? ` · 제공 전 ${upcoming}식` : ''}</span>
        {reconfirm > 0 && <span className="meal-usage-panel__warn">식단 수정으로 확정이 풀린 식사 {reconfirm}식 · 다시 확정해야 재고가 맞습니다</span>}
      </div>
      <div className="meal-usage-panel__actions">
        <button type="button" className="table-meals-modal__button is-secondary" onClick={() => setShowMeals(v => !v)}>{showMeals ? '식사 닫기' : '식사별 보기'}</button>
        <button type="button" className="table-meals-modal__button is-primary" disabled={busy || confirmable.length === 0} onClick={() => openDialog(confirmable, '주간')}>주간 사용 확정</button>
      </div>
    </div>
    {days.length > 0 && <div className="meal-usage-panel__days" aria-label="요일별 사용 확정">
      {days.map(day => <button key={day.date} type="button" className="table-meals-modal__button is-secondary"
        disabled={busy || day.confirmable.length === 0} onClick={() => openDialog(day.confirmable, dayLabel(day.date))}
        title={`${day.date} 사용 확정 ${day.completed}/${day.total}식`}>
        {dayLabel(day.date)} {day.confirmable.length > 0 ? `확정 (${day.confirmable.length})` : day.completed === day.total ? '확정됨' : '확정 불가'}
      </button>)}
    </div>}
    {allowUnserved && <p className="meal-usage-panel__warn">테스트 모드: 아직 제공하지 않은 식사도 사용 확정(재고 차감)할 수 있습니다.</p>}
    <p className="meal-usage-panel__hint">식단을 실제로 제공한 뒤 실제 식수로 확정하면 재고가 차감됩니다. 확정 전에도 지난 식사 사용량은 부족량 계산에서 미리 빼고 계산합니다.</p>
    {error && <p className="meal-usage-panel__error" role="alert">{error}</p>}
    {showMeals && <table className="meal-usage-panel__table"><thead><tr><th>날짜·식사</th><th>상태</th><th>계획 식수</th><th>실제 식수</th><th></th></tr></thead><tbody>
      {meals.map(meal => <tr key={meal.meal_service_id}>
        <td>{meal.meal_date} · {meal.meal_slot}</td>
        <td className={Number(meal.needs_reconfirm) && meal.status !== 'COMPLETED' ? 'is-warn' : ''}>{statusLabel(meal)}</td>
        <td>{qty(meal.planned_servings)}</td>
        <td>{meal.status === 'COMPLETED' ? qty(meal.actual_servings || 0) : '-'}</td>
        <td>{meal.status === 'COMPLETED' && <button type="button" className="table-meals-modal__button is-secondary" disabled={busy} onClick={() => void cancelMeal(meal)}>확정 취소</button>}</td>
      </tr>)}
    </tbody></table>}

    {open && <div className="table-meals-modal-backdrop meal-usage-dialog-backdrop" role="presentation" onClick={closeDialog}>
      <section className="table-meals-modal meal-usage-dialog" role="dialog" aria-modal="true" aria-labelledby="meal-usage-dialog-title" onClick={e => e.stopPropagation()}>
        <div className="table-meals-modal__header">
          <div><p className="table-meals-modal__eyebrow">Weekly Usage</p><h2 id="meal-usage-dialog-title">{scopeLabel} 사용 확정</h2></div>
        </div>
        <div className="meal-usage-dialog__body">
          {modalError && <p className="meal-usage-panel__error" role="alert">{modalError}</p>}

          <h3>1. 실제 식수</h3>
          <table className="meal-usage-panel__table"><thead><tr><th>날짜·식사</th><th>계획 식수</th><th>실제 식수</th></tr></thead><tbody>
            {targets.map(meal => <tr key={meal.meal_service_id}>
              <td>{meal.meal_date} · {meal.meal_slot}{Number(meal.needs_reconfirm) ? ' (재확정)' : ''}</td>
              <td>{qty(meal.planned_servings)}</td>
              <td><input aria-label={`${meal.meal_date} ${meal.meal_slot} 실제 식수`} type="number" min="1" max="1000000" step="1" disabled={busy || step === 'final'}
                value={servings[meal.meal_service_id] || ''}
                onChange={e => changeServings(meal.meal_service_id, e.target.value)} /></td>
            </tr>)}
          </tbody></table>
          {upcoming > 0 && scopeLabel === '주간' && <p className="meal-usage-panel__hint">아직 제공하지 않은 식사 {upcoming}식는 제외됩니다. 제공한 뒤에 확정하세요.</p>}

          {preview && <>
            <h3>2. 재고 차감 내역</h3>
            {shortageCount > 0 && <div className="meal-usage-dialog__notice is-danger">
              <strong>재고가 부족한 식재료 {shortageCount}종이 있어 확정할 수 없습니다.</strong>
              <span>입고 확정을 빠뜨렸다면 먼저 입고를 확정하고, 웰스토리·아워홈 외에 급하게 직접 산 식재료는 직접 구매로 입력한 뒤 다시 확인하세요.</span>
              <Link className="table-meals-modal__button is-secondary" to={`/inventory/account?${new URLSearchParams({ account_id: accountId, direct_purchase: '1' })}`} target="_blank">직접 구매 입력</Link>
            </div>}
            {preview.unreceived_orders.length > 0 && <div className="meal-usage-dialog__notice is-warn">
              <strong>입고 확정이 안 된 발주 {preview.unreceived_orders.length}건</strong>
              <span>실제로 받은 식재료라면 입고를 먼저 확정해야 재고에 반영됩니다.</span>
              <ul>{preview.unreceived_orders.map(order => <li key={order.purchase_order_id}>
                <Link to={`/order_manager/orders?${new URLSearchParams({ account_id: accountId, purchase_order_id: order.purchase_order_id })}`} target="_blank">
                  {order.delivery_date} · {order.supplier_name} · {order.status === 'PARTIAL_RECEIVED' ? '부분 입고' : '미입고'}
                </Link></li>)}</ul>
            </div>}
            {preview.problems.filter(p => !p.ingredient_id).map((p, i) => <p key={i} className="meal-usage-panel__error">{p.meal}: {p.message}</p>)}
            <div className="meal-usage-dialog__scroll"><table className="meal-usage-panel__table"><thead><tr><th>식재료</th><th>사용량</th><th>현재 재고</th><th>차감 후</th><th>부족</th></tr></thead><tbody>
              {preview.ingredients.map(row => <tr key={row.ingredient_id} className={row.shortage_qty > 0 ? 'is-short' : ''}>
                <td>{row.ingredient_name}</td><td>{qty(row.required_qty)} {row.base_unit}</td><td>{qty(row.stock_before)} {row.base_unit}</td>
                <td>{qty(row.stock_after)} {row.base_unit}</td><td>{row.shortage_qty > 0 ? `${qty(row.shortage_qty)} ${row.base_unit}` : '-'}</td>
              </tr>)}
            </tbody></table></div>
          </>}

          {step === 'final' && preview && <div className="meal-usage-dialog__notice is-confirm">
            <strong>정말 이 식단을 사용하셨습니까?</strong>
            <span>{targets.length}식 · 식재료 {preview.ingredients.length}종이 재고에서 차감됩니다. 잘못 확정했다면 식사별 '확정 취소'로 재고를 복원할 수 있습니다.</span>
          </div>}
        </div>
        <div className="table-meals-modal__actions">
          <button type="button" className="table-meals-modal__button is-secondary" disabled={busy} onClick={() => step === 'final' ? setStep('preview') : closeDialog()}>{step === 'final' ? '돌아가기' : '닫기'}</button>
          {step === 'input' && <button type="button" className="table-meals-modal__button is-primary" disabled={busy || targets.length === 0} onClick={() => void runPreview()}>{busy ? '확인 중…' : '차감 내역 확인'}</button>}
          {step === 'preview' && <>
            <button type="button" className="table-meals-modal__button is-secondary" disabled={busy} onClick={() => void runPreview()}>다시 확인</button>
            <button type="button" className="table-meals-modal__button is-primary" disabled={busy || !preview?.can_confirm} onClick={() => setStep('final')}>사용 확정</button>
          </>}
          {step === 'final' && <button type="button" className="table-meals-modal__button is-primary" disabled={busy} onClick={() => void confirmWeek()}>{busy ? '확정 중…' : '네, 사용 확정합니다'}</button>}
        </div>
      </section>
    </div>}
  </section>
}
