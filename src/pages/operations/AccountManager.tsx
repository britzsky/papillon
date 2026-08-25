import { useEffect, useMemo, useState, type DragEvent } from 'react'
import HeaderBar from '../../components/HeaderBar'
import SideMenuLayout from '../../components/SideMenuLayout'
import {
  getAccountMealConfiguration,
  getAccountMealSlots,
  getAccountOptions,
  saveAccountMealConfiguration,
  type AccountMealConfiguration,
  type AccountMealSlotProfile,
  type AccountMealSlot,
  type AccountOption,
} from '../../api/operations'
import './AccountManager.css'

function AccountManager() {
  const [accounts, setAccounts] = useState<AccountOption[]>([])
  const [accountId, setAccountId] = useState('')
  const [mealSlots, setMealSlots] = useState<AccountMealSlot[]>([])
  const [selectedCodes, setSelectedCodes] = useState<number[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [draggedCode, setDraggedCode] = useState<number | null>(null)
  const [configuration, setConfiguration] = useState<AccountMealConfiguration | null>(null)
  const [profiles, setProfiles] = useState<Record<number, AccountMealSlotProfile>>({})

  const foodTypeOptions = [
    [1, '한식'], [2, '중식'], [3, '일식'], [4, '양식'], [5, '분식'], [6, '간식'], [7, '기타'],
  ] as const
  const mealPlanTypeOptions = [
    [0, '일반식'], [1, '가성비식단'], [2, '요양원맞춤식단'], [3, '테마식단'], [4, '다이어트식단'], [5, '프리미엄식단'],
  ] as const

  useEffect(() => {
    void getAccountOptions().then(setAccounts).catch(() => setMessage('고객사 목록을 불러오지 못했습니다.'))
  }, [])

  useEffect(() => {
    if (!accountId) {
      setMealSlots([])
      setSelectedCodes([])
      setConfiguration(null)
      setProfiles({})
      return
    }

    setLoading(true)
    setMessage('')
    void Promise.all([getAccountMealSlots(accountId), getAccountMealConfiguration(accountId)])
      .then(([items, config]) => {
        setMealSlots([...items].sort((a, b) => a.display_order - b.display_order))
        setConfiguration(config)
        setProfiles(Object.fromEntries(config.profiles.map((profile) => [profile.meal_slot_code, profile])))
        setSelectedCodes(
          [...items]
            .filter((item) => item.selected_yn === 'Y')
            .sort((a, b) => a.display_order - b.display_order)
            .map((item) => item.meal_slot_code),
        )
      })
      .catch((error) => setMessage(error instanceof Error ? error.message : '조회에 실패했습니다.'))
      .finally(() => setLoading(false))
  }, [accountId])

  const accountName = useMemo(() => accounts.find((item) => item.value === accountId)?.text ?? '', [accounts, accountId])

  const updateProfile = (code: number, patch: Partial<AccountMealSlotProfile>) => {
    setProfiles((current) => ({
      ...current,
      [code]: {
        ...current[code],
        meal_slot_code: code,
        default_food_type: current[code]?.default_food_type ?? (code === 1 || code === 3 || code >= 6 ? 6 : 1),
        default_meal_plan_type: current[code]?.default_meal_plan_type ?? 0,
        ...patch,
      },
    }))
  }

  const formatMoney = (value?: number | null) => value == null ? '계산 필요' : `${Math.round(value).toLocaleString('ko-KR')}원`

  // 식사구분 카드를 누르면 해당 구분의 선택 상태를 반전한다.
  const toggleMealSlot = (code: number) => {
    setSelectedCodes((current) => current.includes(code) ? current.filter((item) => item !== code) : [...current, code])
  }

  // 선택된 식사구분을 드래그한 위치로 이동해 고객사별 표시 순서를 바꾼n다.
  const moveMealSlot = (event: DragEvent<HTMLButtonElement>, targetCode: number) => {
    event.preventDefault()
    if (draggedCode === null || draggedCode === targetCode) return
    setSelectedCodes((current) => {
      const sourceIndex = current.indexOf(draggedCode)
      const targetIndex = current.indexOf(targetCode)
      if (sourceIndex < 0 || targetIndex < 0) return current
      const next = [...current]
      next.splice(sourceIndex, 1)
      next.splice(targetIndex, 0, draggedCode)
      return next
    })
    setDraggedCode(null)
  }

  // 현재 고객사에서 선택한 식사구분을 저장한다.
  const handleSave = async () => {
    if (!accountId || selectedCodes.length === 0) {
      setMessage('고객사와 하나 이상의 식사구분을 선택해 주세요.')
      return
    }
    setSaving(true)
    setMessage('')
    try {
      await saveAccountMealConfiguration({
        account_id: accountId,
        meal_slots: selectedCodes.map((code, index) => ({
          meal_slot_code: code,
          display_order: index + 1,
          default_food_type: profiles[code]?.default_food_type ?? (code === 1 || code === 3 || code >= 6 ? 6 : 1),
          default_meal_plan_type: profiles[code]?.default_meal_plan_type ?? 0,
          template_id: profiles[code]?.template_id ?? null,
        })),
      })
      const refreshed = await getAccountMealConfiguration(accountId)
      setConfiguration(refreshed)
      setProfiles(Object.fromEntries(refreshed.profiles.map((profile) => [profile.meal_slot_code, profile])))
      setMessage('급식형식과 기본 식사 구성을 함께 저장했습니다.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '저장에 실패했습니다.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <SideMenuLayout header={<HeaderBar />}>
      <main className="account-manager-page">
        <section className="account-manager-toolbar">
          <div className="account-manager-toolbar__field">
            <label htmlFor="account-manager-account">고객사</label>
            <select id="account-manager-account" value={accountId} onChange={(event) => setAccountId(event.target.value)}>
              <option value="">고객사를 선택하세요</option>
              {accounts.map((account) => <option key={account.value} value={account.value}>{account.text || account.value}</option>)}
            </select>
          </div>
          <button type="button" onClick={handleSave} disabled={!accountId || loading || saving}>
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
              {[...mealSlots].sort((a, b) => {
                const aIndex = selectedCodes.indexOf(a.meal_slot_code)
                const bIndex = selectedCodes.indexOf(b.meal_slot_code)
                if (aIndex >= 0 && bIndex >= 0) return aIndex - bIndex
                if (aIndex >= 0) return -1
                if (bIndex >= 0) return 1
                return a.display_order - b.display_order
              }).map((slot) => {
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
                    onDrop={(event) => moveMealSlot(event, slot.meal_slot_code)}
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
                  const isSnack = [1, 3, 4, 6, 7, 8].includes(code)
                  return (
                    <div className="account-manager-config-row" key={code}>
                      <strong>{slot?.meal_slot_name ?? `식사 ${code}`}</strong>
                      <label>
                        <span>식사분류</span>
                        <select value={profile?.default_food_type ?? (isSnack ? 6 : 1)} onChange={(event) => updateProfile(code, { default_food_type: Number(event.target.value) })}>
                          {foodTypeOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                        </select>
                      </label>
                      <label>
                        <span>식단유형</span>
                        <select value={profile?.default_meal_plan_type ?? 0} onChange={(event) => updateProfile(code, { default_meal_plan_type: Number(event.target.value) })}>
                          {mealPlanTypeOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                        </select>
                      </label>
                      <div className="account-manager-config-row__budget">
                        <span>1인 단가</span>
                        <strong>{formatMoney(profile?.budget_per_person)}</strong>
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
