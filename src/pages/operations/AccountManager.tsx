import { useEffect, useMemo, useState } from 'react'
import HeaderBar from '../../components/HeaderBar'
import LoadingScreen from '../../components/LoadingScreen'
import SideMenuLayout from '../../components/SideMenuLayout'
import { useSearchParams } from 'react-router-dom'
import { workspaceAccountId } from '../../features/workspace/workspaceAccount'
import { getAccountOptions, type AccountOption } from '../../api/operations'
import { FOOD_TYPE_OPTIONS, MEAL_PLAN_TYPE_OPTIONS, formatBudget, isSnackSlot, useAccountMealConfig } from '../../features/operations/useAccountMealConfig'
import './AccountManager.css'

/** 고객사 관리(PC). 식사 설정 로직은 features/operations/useAccountMealConfig(터치 화면과 공용). 순서는 끌어 놓기로 바꾼다. */
function AccountManager() {
  const [accounts, setAccounts] = useState<AccountOption[]>([])
  // 관리 거래처는 머리 줄에서 고른다
  const accountId = workspaceAccountId(useSearchParams()[0])
  const [draggedCode, setDraggedCode] = useState<number | null>(null)
  const { mealSlots, orderedSlots, selectedCodes, configuration, profiles, loading, saving, message, setMessage, toggleMealSlot, placeMealSlot, updateProfile, save } = useAccountMealConfig(accountId)

  useEffect(() => {
    void getAccountOptions().then(setAccounts).catch(() => setMessage('고객사 목록을 불러오지 못했습니다.'))
  }, [setMessage])

  const accountName = useMemo(() => accounts.find((item) => item.value === accountId)?.text ?? '', [accounts, accountId])

  return (
    <SideMenuLayout header={<HeaderBar title="고객사 관리" breadcrumbs={[{ label: "홈", to: "/home" }, { label: "본사관리" }, { label: "고객사 관리" }]} />}>
      {saving ? <LoadingScreen overlay message="거래처 식사 설정을 저장하고 있습니다." /> : null}
      <div className="rd rd-page rd-acc">
        <header className="rd-page__head">
          <div>
            <h1 className="rd-h1">고객사 관리</h1>
            <p className="rd-muted">{accountName ? `${accountName}에서 제공하는 식사와 기본 식사 구성을 정합니다.` : "머리 줄의 '관리 거래처'에서 고객사를 고르면 식사구분을 설정할 수 있습니다."}</p>
          </div>
          <div className="rd-page__actions">
            <button type="button" className="rd-btn is-primary" onClick={() => void save()} disabled={!accountId || loading || saving}>
              {saving ? '저장 중' : '저장'}
            </button>
          </div>
        </header>
        {message ? <p className="rd-page__notice" role="status">{message}</p> : null}

        {loading ? <p className="rd-card rd-page__empty">설정을 불러오는 중입니다.</p> : null}
        {!loading && !accountId ? <p className="rd-card rd-page__empty">오른쪽 위에서 설정할 고객사를 고르세요.</p> : null}
        {!loading && accountId ? (
          <>
            <section className="rd-card rd-page__box">
              <div className="rd-acc__title">
                <h2 className="rd-h2">제공하는 식사</h2>
                <span className="rd-chip is-ok">{selectedCodes.length}개 선택</span>
                <span className="rd-muted">눌러서 켜고 끄며, 켠 식사는 끌어서 순서를 바꿉니다.</span>
              </div>
              <div className="rd-acc__slots">
                {orderedSlots.map((slot) => {
                  const selected = selectedCodes.includes(slot.meal_slot_code)
                  return (
                    <button
                      key={slot.meal_slot_code}
                      type="button"
                      draggable={selected}
                      className={`rd-acc__slot${selected ? ' is-selected' : ''}${draggedCode === slot.meal_slot_code ? ' is-dragging' : ''}`}
                      onDragStart={() => setDraggedCode(slot.meal_slot_code)}
                      onDragEnd={() => setDraggedCode(null)}
                      onDragOver={(event) => { if (selected) event.preventDefault() }}
                      onDrop={(event) => { event.preventDefault(); if (draggedCode !== null) placeMealSlot(draggedCode, slot.meal_slot_code); setDraggedCode(null) }}
                      onClick={() => toggleMealSlot(slot.meal_slot_code)}
                      aria-pressed={selected}
                    >
                      <span className="rd-acc__check">{selected ? selectedCodes.indexOf(slot.meal_slot_code) + 1 : ''}</span>
                      <strong>{slot.meal_slot_name}</strong>
                      <small>{selected ? `${selectedCodes.indexOf(slot.meal_slot_code) + 1}번째 · 끌어서 이동` : `코드 ${slot.meal_slot_code}`}</small>
                    </button>
                  )
                })}
              </div>
            </section>

            <section className="rd-card rd-page__box" aria-label="기본 식사 구성">
              <div className="rd-acc__title">
                <div>
                  <h2 className="rd-h2">기본 식사 구성</h2>
                  <p className="rd-muted">자동 식단표의 기본값입니다. 특정 날짜의 분류·식단유형은 식단표 화면에서 바꿀 수 있습니다.</p>
                </div>
                <div className="rd-acc__type">
                  <strong>{configuration?.account_type_name || `고객사 유형 ${configuration?.account_type ?? '-'}`}</strong>
                  <small className="rd-muted">본식 {configuration?.main_meal_count ?? 0}회 기준 · 서버 자동 계산</small>
                </div>
              </div>
              {selectedCodes.length === 0 ? <p className="rd-page__empty">위에서 제공하는 식사를 먼저 고르세요.</p> : (
                <table className="rd-table">
                  <thead><tr><th>식사</th><th>식사분류</th><th>식단유형</th><th className="is-num">1인 단가</th></tr></thead>
                  <tbody>
                    {selectedCodes.map((code) => {
                      const slot = mealSlots.find((item) => item.meal_slot_code === code)
                      const profile = profiles[code]
                      const isSnack = isSnackSlot(code)
                      return (
                        <tr key={code}>
                          <td><strong>{slot?.meal_slot_name ?? `식사 ${code}`}</strong></td>
                          <td>
                            <select className="rd-input" aria-label="식사분류" value={profile?.default_food_type ?? (isSnack ? 6 : 1)} onChange={(event) => updateProfile(code, { default_food_type: Number(event.target.value) })}>
                              {FOOD_TYPE_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                            </select>
                          </td>
                          <td>
                            <select className="rd-input" aria-label="식단유형" value={profile?.default_meal_plan_type ?? 0} onChange={(event) => updateProfile(code, { default_meal_plan_type: Number(event.target.value) })}>
                              {MEAL_PLAN_TYPE_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                            </select>
                          </td>
                          <td className="is-num">
                            <strong>{formatBudget(profile?.budget_per_person)}</strong>
                            <small className="rd-muted">{profile?.budget_source || (isSnack ? '간식 단가' : '고객사 유형별 자동 계산')}</small>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </section>
          </>
        ) : null}
      </div>
    </SideMenuLayout>
  )
}

export default AccountManager
