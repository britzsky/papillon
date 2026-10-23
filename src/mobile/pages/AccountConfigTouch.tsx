import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import TouchLayout from '../TouchLayout'
import TouchIcon from '../TouchIcon'
import { FOOD_TYPE_OPTIONS, MEAL_PLAN_TYPE_OPTIONS, formatBudget, useAccountMealConfig } from '../../features/operations/useAccountMealConfig'
import './AccountConfigTouch.css'

/**
 * 고객사 관리(태블릿·휴대폰): 위 거래처 선택 → 식사 구분 칸을 눌러 고르고(번호 = 순서, ▲▼로 순서 바꾸기),
 * 고른 식사마다 기본 분류·식단유형을 정한다. 오른쪽에 급식형식·1인 단가 요약과 저장. 로직은 PC와 같은 useAccountMealConfig.
 */
export default function AccountConfigTouch() {
  const [params] = useSearchParams()
  const [accountId, setAccountId] = useState(() => params.get('account_id') || localStorage.getItem('account_id') || '')
  const c = useAccountMealConfig(accountId)

  const aside = <div className="ac-panel">
    <div className="ac-panel__head"><h2>급식형식</h2><p>자동 식단표의 기본값입니다. 날짜별로는 식단표 제작에서 바꿀 수 있습니다.</p></div>
    <div className="ac-panel__body">
      <div className="ac-type">
        <strong>{c.configuration?.account_type_name || (c.configuration ? `고객사 유형 ${c.configuration.account_type}` : '-')}</strong>
        <span>본식 {c.configuration?.main_meal_count ?? 0}회 기준 · 서버 자동 계산</span>
      </div>
      <ul className="ac-budgets">{c.selectedCodes.map(code => {
        const slot = c.mealSlots.find(item => item.meal_slot_code === code)
        const profile = c.profiles[code]
        return <li key={code}><span>{slot?.meal_slot_name ?? `식사 ${code}`}</span><strong>{formatBudget(profile?.budget_per_person)}</strong><small>{profile?.budget_source || (c.isSnack(code) ? '간식 단가' : '고객사 유형별 자동 계산')}</small></li>
      })}</ul>
      {c.message && <p className={`t-msg ${/실패|선택해/.test(c.message) ? 'is-error' : 'ac-ok'}`} role="status">{c.message}</p>}
    </div>
    <div className="ac-panel__actions">
      <div className="t-summary"><div className="is-total"><span>제공 식사</span><span>{c.selectedCodes.length}개</span></div></div>
      <button type="button" className="t-btn is-primary is-large is-block" disabled={!accountId || c.loading || c.saving} onClick={() => void c.save()}>{c.saving ? '저장 중…' : '저장'}</button>
    </div>
  </div>

  return <TouchLayout title="고객사 관리" subtitle="제공하는 식사와 기본 구성" aside={accountId ? aside : undefined} onAccountChange={setAccountId}>
    {!accountId && <p className="t-msg">위에서 고객사를 고르면 식사 설정이 나옵니다.</p>}
    {c.loading && <p className="t-msg" role="status">설정을 불러오는 중…</p>}

    {accountId && !c.loading && <>
      <h2 className="t-section-title">제공하는 식사<small className="ac-sub">눌러서 고르기 · 번호가 표시 순서</small></h2>
      <div className="ac-slots">
        {c.orderedSlots.map(slot => {
          const index = c.selectedCodes.indexOf(slot.meal_slot_code)
          const selected = index >= 0
          return <div key={slot.meal_slot_code} className={`t-card ac-slot${selected ? ' is-selected' : ''}`}>
            <button type="button" className="ac-slot__main" aria-pressed={selected} onClick={() => c.toggleMealSlot(slot.meal_slot_code)}>
              <span className={`ac-slot__num${selected ? ' is-on' : ''}`}>{selected ? index + 1 : <TouchIcon name="check" size={18} />}</span>
              <strong>{slot.meal_slot_name}</strong>
              <small>{selected ? `${index + 1}번째` : `코드 ${slot.meal_slot_code}`}</small>
            </button>
            {selected && <span className="ac-slot__order">
              <button type="button" aria-label={`${slot.meal_slot_name} 앞으로`} disabled={index === 0} onClick={() => c.moveMealSlot(slot.meal_slot_code, -1)}>▲</button>
              <button type="button" aria-label={`${slot.meal_slot_name} 뒤로`} disabled={index === c.selectedCodes.length - 1} onClick={() => c.moveMealSlot(slot.meal_slot_code, 1)}>▼</button>
            </span>}
          </div>
        })}
      </div>

      {c.selectedCodes.length > 0 && <>
        <h2 className="t-section-title">식사별 기본 구성</h2>
        <div className="ac-config">
          {c.selectedCodes.map(code => {
            const slot = c.mealSlots.find(item => item.meal_slot_code === code)
            const profile = c.profiles[code]
            const foodType = profile?.default_food_type ?? (c.isSnack(code) ? 6 : 1)
            const planType = profile?.default_meal_plan_type ?? 0
            return <article key={code} className="t-card ac-row">
              <h3>{slot?.meal_slot_name ?? `식사 ${code}`}</h3>
              <span className="ac-label">식사분류</span>
              <div className="ac-chips">{FOOD_TYPE_OPTIONS.map(([value, label]) => <button key={value} type="button" className={foodType === value ? 'is-active' : ''} onClick={() => c.updateProfile(code, { default_food_type: value })}>{label}</button>)}</div>
              <span className="ac-label">식단유형</span>
              <div className="ac-chips">{MEAL_PLAN_TYPE_OPTIONS.map(([value, label]) => <button key={value} type="button" className={planType === value ? 'is-active' : ''} onClick={() => c.updateProfile(code, { default_meal_plan_type: value })}>{label}</button>)}</div>
            </article>
          })}
        </div>
      </>}
    </>}
  </TouchLayout>
}
