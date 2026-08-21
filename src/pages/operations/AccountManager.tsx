import { useEffect, useMemo, useState, type DragEvent } from 'react'
import HeaderBar from '../../components/HeaderBar'
import SideMenuLayout from '../../components/SideMenuLayout'
import {
  getAccountMealSlots,
  getAccountOptions,
  saveAccountMealSlots,
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

  useEffect(() => {
    void getAccountOptions().then(setAccounts).catch(() => setMessage('고객사 목록을 불러오지 못했습니다.'))
  }, [])

  useEffect(() => {
    if (!accountId) {
      setMealSlots([])
      setSelectedCodes([])
      return
    }

    setLoading(true)
    setMessage('')
    void getAccountMealSlots(accountId)
      .then((items) => {
        setMealSlots([...items].sort((a, b) => a.display_order - b.display_order))
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
      await saveAccountMealSlots(accountId, selectedCodes)
      setMessage('식사구분 설정을 저장했습니다.')
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
            <div className="account-manager-slots">
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
          ) : null}
          {!loading && !accountId ? <div className="account-manager-empty">상단에서 설정할 고객사를 선택해 주세요.</div> : null}
          {message ? <p className="account-manager-message" role="status">{message}</p> : null}
        </section>
      </main>
    </SideMenuLayout>
  )
}

export default AccountManager
