import { createPortal } from 'react-dom'
import { FOOD_TYPE_OPTIONS, MEAL_PLAN_TYPE_OPTIONS, formatBudget, useAccountMealConfig } from '../operations/useAccountMealConfig'
import './MealConfigDialog.css'

/**
 * 식단표 화면 안에서 여는 거래처 식사 구성(제공 식사·순서·식사별 기본 분류·식단유형).
 * 고객사 관리(본사 전용)와 같은 useAccountMealConfig를 써서, 거래처 계정도 자기 거래처 구성을 저장할 수 있다.
 * 서버는 거래처 계정의 account_id를 로그인 거래처로 덮어쓴다. PC·터치 공용이라 순서는 ▲▼ 버튼으로 바꾼다.
 */
/** 1인 단가 출처(서버 단가 뷰 budget_source) → 화면 글자. 요양원 본식은 ERP 어르신 1끼 단가 그대로(2026-10-26) */
const BUDGET_SOURCE_LABEL: Record<string, string> = {
  ELDERLY_EACH: 'ERP 어르신 1끼 단가', ELDERLY_DIVIDED: 'ERP 어르신 단가 ÷ 본식 수', SNACK: 'ERP 간식 단가', OVERRIDE: '직접 지정 단가',
  DIET_PRICE_EACH: 'ERP 식단가(끼니마다)', DIET_PRICE_DIVIDED: 'ERP 식단가 ÷ 본식 수', INCLUDED_IN_DIET_PRICE: '식단가에 포함', POLICY_REQUIRED: '단가 정책 필요',
}

export default function MealConfigDialog({ accountId, accountName, onClose, onSaved }: {
  accountId: string
  accountName?: string
  onClose: () => void
  /** 저장 성공 뒤(식단표 화면이 식사 구분을 다시 불러오게) */
  onSaved: () => void
}) {
  const c = useAccountMealConfig(accountId)
  const save = async () => { if (await c.save()) onSaved() }

  return createPortal(
    <div className="meal-config-backdrop" role="presentation" onClick={() => { if (!c.saving) onClose() }}>
      <section className="meal-config" role="dialog" aria-modal="true" aria-labelledby="meal-config-title" onClick={event => event.stopPropagation()}>
        <header className="meal-config__head">
          <div>
            <h2 id="meal-config-title">식사 구성</h2>
            <p>{accountName ? `${accountName} · ` : ''}제공하는 식사와 자동 식단표 기본값입니다. 특정 날짜만 바꿀 때는 '편성 설정'을 쓰세요.</p>
          </div>
          <div className="meal-config__type">
            <strong>{c.configuration?.account_type_name || (c.configuration ? `고객사 유형 ${c.configuration.account_type}` : '-')}</strong>
            <small>본식 {c.configuration?.main_meal_count ?? 0}회 · 1인 단가는 ERP 거래처 단가로 서버 계산</small>
          </div>
        </header>

        <div className="meal-config__body">
          {c.loading ? <p className="meal-config__empty" role="status">설정을 불러오는 중입니다.</p> : <>
            <h3>제공하는 식사 <small>눌러서 켜고 끄기 · 번호가 표시 순서</small></h3>
            <div className="meal-config__slots">
              {c.orderedSlots.map(slot => {
                const index = c.selectedCodes.indexOf(slot.meal_slot_code)
                const selected = index >= 0
                return <div key={slot.meal_slot_code} className={`meal-config__slot${selected ? ' is-selected' : ''}`}>
                  <button type="button" className="meal-config__slot-main" aria-pressed={selected} onClick={() => c.toggleMealSlot(slot.meal_slot_code)}>
                    <span className="meal-config__num">{selected ? index + 1 : ''}</span>
                    <strong>{slot.meal_slot_name}</strong>
                  </button>
                  {selected ? <span className="meal-config__order">
                    <button type="button" aria-label={`${slot.meal_slot_name} 앞으로`} disabled={index === 0} onClick={() => c.moveMealSlot(slot.meal_slot_code, -1)}>▲</button>
                    <button type="button" aria-label={`${slot.meal_slot_name} 뒤로`} disabled={index === c.selectedCodes.length - 1} onClick={() => c.moveMealSlot(slot.meal_slot_code, 1)}>▼</button>
                  </span> : null}
                </div>
              })}
            </div>

            <h3>식사별 기본 구성</h3>
            {c.selectedCodes.length === 0 ? <p className="meal-config__empty">위에서 제공하는 식사를 먼저 고르세요.</p> : (
              <div className="meal-config__table-scroll">
                <table className="meal-config__table">
                  <thead><tr><th>식사</th><th>식사분류</th><th>식단유형</th><th className="is-num">1인 단가</th></tr></thead>
                  <tbody>
                    {c.selectedCodes.map(code => {
                      const slot = c.mealSlots.find(item => item.meal_slot_code === code)
                      const profile = c.profiles[code]
                      const isSnack = c.isSnack(code)
                      return <tr key={code}>
                        <th scope="row">{slot?.meal_slot_name ?? `식사 ${code}`}</th>
                        <td>
                          <select aria-label={`${slot?.meal_slot_name ?? code} 식사분류`} value={profile?.default_food_type ?? (isSnack ? 6 : 1)} onChange={event => c.updateProfile(code, { default_food_type: Number(event.target.value) })}>
                            {FOOD_TYPE_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                          </select>
                        </td>
                        <td>
                          <select aria-label={`${slot?.meal_slot_name ?? code} 식단유형`} value={profile?.default_meal_plan_type ?? 0} onChange={event => c.updateProfile(code, { default_meal_plan_type: Number(event.target.value) })}>
                            {MEAL_PLAN_TYPE_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                          </select>
                        </td>
                        <td className="is-num">
                          <strong>{formatBudget(profile?.budget_per_person)}</strong>
                          <small>{BUDGET_SOURCE_LABEL[profile?.budget_source ?? ''] || profile?.budget_source || (isSnack ? '간식 단가' : '고객사 유형별 자동 계산')}</small>
                        </td>
                      </tr>
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>}
          {c.message ? <p className={`meal-config__message${/실패|선택해|required|권한|접근/.test(c.message) ? ' is-error' : ''}`} role="status">{c.message}</p> : null}
        </div>

        <footer className="meal-config__actions">
          <button type="button" className="meal-config__button" onClick={onClose} disabled={c.saving}>닫기</button>
          <button type="button" className="meal-config__button is-primary" onClick={() => void save()} disabled={!accountId || c.loading || c.saving || c.selectedCodes.length === 0}>
            {c.saving ? '저장 중…' : '저장'}
          </button>
        </footer>
      </section>
    </div>,
    document.body,
  )
}
