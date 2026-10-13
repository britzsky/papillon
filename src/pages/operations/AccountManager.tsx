import { useEffect, useMemo, useState } from 'react'
import HeaderBar from '../../components/HeaderBar'
import LoadingScreen from '../../components/LoadingScreen'
import SideMenuLayout from '../../components/SideMenuLayout'
import { getAccountOptions, type AccountOption } from '../../api/operations'
import { FOOD_TYPE_OPTIONS, MEAL_PLAN_TYPE_OPTIONS, formatBudget, isSnackSlot, useAccountMealConfig } from '../../features/operations/useAccountMealConfig'
import './AccountManager.css'

/** 고객사 관리(PC). 식사 설정 로직은 features/operations/useAccountMealConfig(터치 화면과 공용). 순서는 끌어 놓기로 바꾼다. */
function AccountManager() {
  const [accounts, setAccounts] = useState<AccountOption[]>([])
  const [accountId, setAccountId] = useState('')
  const [draggedCode, setDraggedCode] = useState<number | null>(null)
  const { mealSlots, orderedSlots, selectedCodes, configuration, profiles, loading, saving, message, setMessage, toggleMealSlot, placeMealSlot, updateProfile, save } = useAccountMealConfig(accountId)

  useEffect(() => {
    void getAccountOptions().then(setAccounts).catch(() => setMessage('고객사 목록을 불러오지 못했습니다.'))
  }, [setMessage])

  const accountName = useMemo(() => accounts.find((item) => item.value === accountId)?.text ?? '', [accounts, accountId])

  return (
    <SideMenuLayout header={<HeaderBar title="고객사 관리" breadcrumbs={[{ label: "홈", to: "/home" }, { label: "본사관리" }, { label: "고객사 관리" }]} />}>
      {saving ? <LoadingScreen overlay message="거래처 식사 설정을 저장하고 있습니다." /> : null}
      <main className="account-manager-page">
        <section className="account-manager-toolbar">
          <div className="account-manager-toolbar__field">
            <label htmlFor="account-manager-account">고객사</label>
            <select id="account-manager-account" value={accountId} onChange={(event) => setAccountId(event.target.value)}>
              <option value="">고객사를 선택하세요</option>
              {accounts.map((account) => <option key={account.value} value={account.value}>{account.text || account.value}</option>)}
            </select>
          </div>
          <button type="button" onClick={() => void save()} disabled={!accountId || loading || saving}>
            {saving ? '저장 중' : '저장'}
          </button>
        </section>

        <section className="account-manager-panel">
          <div className="account-manager-panel__header">
            <div><h1>고객사 관리</h1><p>{accountName ? `${accountName}에서 제공하는 식사를 선택하세요.` : '고객사를 선택하면 식사구분을 설정할 수 있습니다.'}</p></div>
            {accountId ? <span>{selectedCodes.length}개 선택</span> : null}
          </div>

          {loading ? <div className="account-manager-empty">설정을 불러오는 중입니다.</div> : null}
          {!loading && accountId ? (
            <><div className="account-manager-slots">
              {orderedSlots.map((slot) => {
                const selected = selectedCodes.includes(slot.meal_slot_code)
                return (
                  <button
                    key={slot.meal_slot_code}
                    type="button"
                    draggable={selected}
                    className={`account-manager-slot${selected ? ' is-selected' : ''}${draggedCode === slot.meal_slot_code ? ' is-dragging' : ''}`}
                    onDragStart={() => setDraggedCode(slot.meal_slot_code)}
                    onDragEnd={() => setDraggedCode(null)}
                    onDragOver={(event) => { if (selected) event.preventDefault() }}
                    onDrop={(event) => { event.preventDefault(); if (draggedCode !== null) placeMealSlot(draggedCode, slot.meal_slot_code); setDraggedCode(null) }}
                    onClick={() => toggleMealSlot(slot.meal_slot_code)}
                    aria-pressed={selected}
                  >
                    <span className="account-manager-slot__check">{selected ? '✓' : ''}</span>
                    <strong>{slot.meal_slot_name}</strong>
                    <small>{selected ? `${selectedCodes.indexOf(slot.meal_slot_code) + 1}번 순서 · 드래그로 이동` : `코드 ${slot.meal_slot_code}`}</small>
                  </button>
                )
              })}
            </div>

            <section className="account-manager-config" aria-label="기본 식사 구성">
              <div className="account-manager-config__heading">
                <div>
                  <h2>기본 식사 구성</h2>
                  <p>자동 식단표의 기본값입니다. 특정 날짜의 분류와 식단유형은 식단표 제작 화면에서 바꿀 수 있습니다.</p>
                </div>
                <div className="account-manager-price-summary">
                  <strong>{configuration?.account_type_name || `고객사 유형 ${configuration?.account_type ?? '-'}`}</strong>
                  <span>본식 {configuration?.main_meal_count ?? 0}회 기준 · 서버 자동 계산</span>
                </div>
              </div>

              <div className="account-manager-config__rows">
                {selectedCodes.map((code) => {
                  const slot = mealSlots.find((item) => item.meal_slot_code === code)
                  const profile = profiles[code]
                  const isSnack = isSnackSlot(code)
                  return (
                    <div className="account-manager-config-row" key={code}>
                      <strong>{slot?.meal_slot_name ?? `식사 ${code}`}</strong>
                      <label>
                        <span>식사분류</span>
                        <select value={profile?.default_food_type ?? (isSnack ? 6 : 1)} onChange={(event) => updateProfile(code, { default_food_type: Number(event.target.value) })}>
                          {FOOD_TYPE_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                        </select>
                      </label>
                      <label>
                        <span>식단유형</span>
                        <select value={profile?.default_meal_plan_type ?? 0} onChange={(event) => updateProfile(code, { default_meal_plan_type: Number(event.target.value) })}>
                          {MEAL_PLAN_TYPE_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                        </select>
                      </label>
                      <div className="account-manager-config-row__budget">
                        <span>1인 단가</span>
                        <strong>{formatBudget(profile?.budget_per_person)}</strong>
                        <small>{profile?.budget_source || (isSnack ? '간식 단가' : '고객사 유형별 자동 계산')}</small>
                      </div>
                    </div>
                  )
                })}
              </div>
            </section></>
          ) : null}
          {!loading && !accountId ? <div className="account-manager-empty">상단에서 설정할 고객사를 선택해 주세요.</div> : null}
          {message ? <p className="account-manager-message" role="status">{message}</p> : null}
        </section>
      </main>
    </SideMenuLayout>
  )
}

export default AccountManager
