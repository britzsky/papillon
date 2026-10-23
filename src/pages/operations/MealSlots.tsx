import { useEffect, useState } from 'react'
import HeaderBar from '../../components/HeaderBar'
import SideMenuLayout from '../../components/SideMenuLayout'
import { createMealSlot, getMealSlots, reorderMealSlots, updateMealSlot, type MealSlot, type MealSlotKind } from '../../api/mealSlots'
import './MealSlots.css'

const KIND_LABEL: Record<MealSlotKind, string> = { MAIN: '본식', SNACK: '간식' }

/**
 * 끼니 종류 관리(본사 전용, 2026-10-23 사용자 결정). 여기서 만든 끼니를 거래처 식사 설정에서 고른다.
 * 본식은 1일 식단가를 나누는 끼니(요양원·학교), 간식은 간식 단가. 거래처가 쓰고 있을 수 있어 삭제 대신 '사용 안 함'.
 */
export default function MealSlots() {
  const [slots, setSlots] = useState<MealSlot[]>([])
  const [drafts, setDrafts] = useState<Record<number, Partial<Pick<MealSlot, 'meal_slot_name' | 'slot_kind' | 'active_yn'>>>>({})
  const [name, setName] = useState('')
  const [kind, setKind] = useState<MealSlotKind>('SNACK')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [failed, setFailed] = useState(false)
  const [revision, setRevision] = useState(0)

  useEffect(() => {
    let alive = true
    getMealSlots().then(rows => { if (alive) { setSlots(rows); setDrafts({}) } })
      .catch(error => { if (alive) setFailed(true); if (alive) setMessage(error instanceof Error ? error.message : '끼니 종류를 불러오지 못했습니다.') })
    return () => { alive = false }
  }, [revision])

  const run = async (action: () => Promise<unknown>, done: string) => {
    setBusy(true); setMessage('')
    try { await action(); setFailed(false); setMessage(done); setRevision(value => value + 1) }
    catch (error) { setFailed(true); setMessage(error instanceof Error ? error.message : '저장하지 못했습니다.') }
    finally { setBusy(false) }
  }
  const valueOf = (slot: MealSlot) => ({ meal_slot_name: slot.meal_slot_name, slot_kind: slot.slot_kind, active_yn: slot.active_yn, ...drafts[slot.meal_slot_code] })
  const change = (slot: MealSlot, patch: Partial<Pick<MealSlot, 'meal_slot_name' | 'slot_kind' | 'active_yn'>>) =>
    setDrafts(current => ({ ...current, [slot.meal_slot_code]: { ...valueOf(slot), ...patch } }))
  const dirty = (slot: MealSlot) => {
    const value = valueOf(slot)
    return value.meal_slot_name !== slot.meal_slot_name || value.slot_kind !== slot.slot_kind || value.active_yn !== slot.active_yn
  }

  const add = () => {
    const trimmed = name.trim()
    if (!trimmed) { setFailed(true); setMessage('끼니 이름을 입력해 주세요.'); return }
    void run(async () => { await createMealSlot(trimmed, kind); setName('') }, `'${trimmed}' 끼니를 추가했습니다. 거래처 식사 설정에서 고를 수 있습니다.`)
  }
  const save = (slot: MealSlot) => {
    const value = valueOf(slot)
    if (!value.meal_slot_name.trim()) { setFailed(true); setMessage('끼니 이름을 입력해 주세요.'); return }
    // 본식/간식을 바꾸면 이 끼니를 쓰는 거래처의 1인 단가 계산이 바뀐다
    if (value.slot_kind !== slot.slot_kind && slot.account_count > 0
      && !window.confirm(`${slot.meal_slot_name}을(를) ${KIND_LABEL[value.slot_kind]}으로 바꾸면 이 끼니를 쓰는 거래처 ${slot.account_count}곳의 1인 식단가 계산이 바뀝니다. 바꿀까요?`)) return
    void run(() => updateMealSlot({ meal_slot_code: slot.meal_slot_code, ...value, meal_slot_name: value.meal_slot_name.trim() }), `'${value.meal_slot_name.trim()}' 저장했습니다.`)
  }
  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction
    if (target < 0 || target >= slots.length) return
    const codes = slots.map(slot => slot.meal_slot_code)
    ;[codes[index], codes[target]] = [codes[target], codes[index]]
    void run(() => reorderMealSlots(codes), '기본 순서를 바꿨습니다.')
  }

  return <div className="meal-slots-page"><SideMenuLayout header={<HeaderBar title="끼니 종류 관리" breadcrumbs={[{ label: '본사관리' }, { label: '끼니 종류 관리' }]} />}>
    <div className="rd rd-page rd-meal-slots">
      <header className="rd-page__head">
        <div>
          <h1 className="rd-sr-only">끼니 종류 관리</h1>
          <p className="rd-muted">모든 거래처가 함께 쓰는 끼니 목록입니다. 거래처는 고객사 관리 · 식사 설정에서 이 중 쓸 끼니를 고릅니다.
            <br /><b>본식</b>은 1일 식단가를 나누는 끼니(요양원·학교), <b>간식</b>은 간식 단가를 씁니다.</p>
        </div>
      </header>
      {message ? <p className={`meal-slots__msg${failed ? ' is-error' : ''}`} role="status">{message}</p> : null}

      <section className="rd-card rd-page__box">
        <h2 className="rd-h2">끼니 추가</h2>
        <form className="meal-slots__add" onSubmit={event => { event.preventDefault(); add() }}>
          <input className="rd-input" aria-label="새 끼니 이름" placeholder="예: 아침간식" maxLength={30} value={name} disabled={busy} onChange={event => setName(event.target.value)} />
          <div className="rd-seg" role="group" aria-label="본식 또는 간식">
            {(['MAIN', 'SNACK'] as const).map(value => <button type="button" key={value} className={kind === value ? 'is-active' : ''} aria-pressed={kind === value} onClick={() => setKind(value)}>{KIND_LABEL[value]}</button>)}
          </div>
          <button type="submit" className="rd-btn is-primary" disabled={busy || !name.trim()}>추가</button>
        </form>
      </section>

      <section className="rd-card rd-page__main">
        <div className="rd-page__list-head"><h2 className="rd-h2">끼니 {slots.length}개</h2><span className="rd-muted rd-fs-sm">순서는 거래처가 아직 고르지 않은 끼니·식단 목록의 기본 순서입니다.</span></div>
        <div className="rd-page__scroll" tabIndex={0} role="region" aria-label="끼니 목록">
          <table className="rd-table meal-slots__table">
            <thead><tr><th>순서</th><th>이름</th><th>구분</th><th>사용</th><th className="is-num">쓰는 거래처</th><th aria-label="저장" /></tr></thead>
            <tbody>{slots.map((slot, index) => {
              const value = valueOf(slot)
              return <tr key={slot.meal_slot_code} className={value.active_yn === 'N' ? 'is-off' : ''}>
                <td className="meal-slots__order"><span>
                  <button type="button" aria-label={`${slot.meal_slot_name} 위로`} disabled={busy || index === 0} onClick={() => move(index, -1)}>▲</button>
                  <button type="button" aria-label={`${slot.meal_slot_name} 아래로`} disabled={busy || index === slots.length - 1} onClick={() => move(index, 1)}>▼</button>
                </span></td>
                <td><input className="rd-input" aria-label={`코드 ${slot.meal_slot_code} 이름`} maxLength={30} value={value.meal_slot_name} disabled={busy} onChange={event => change(slot, { meal_slot_name: event.target.value })} /></td>
                <td><select className="rd-input" aria-label={`${slot.meal_slot_name} 구분`} value={value.slot_kind} disabled={busy} onChange={event => change(slot, { slot_kind: event.target.value as MealSlotKind })}>
                  <option value="MAIN">본식</option><option value="SNACK">간식</option></select></td>
                <td><label className="meal-slots__active"><input type="checkbox" checked={value.active_yn === 'Y'} disabled={busy} onChange={event => change(slot, { active_yn: event.target.checked ? 'Y' : 'N' })} />{value.active_yn === 'Y' ? '사용' : '사용 안 함'}</label></td>
                <td className="is-num">{slot.account_count}곳</td>
                <td><button type="button" className="rd-btn" disabled={busy || !dirty(slot)} onClick={() => save(slot)}>저장</button></td>
              </tr>
            })}</tbody>
          </table>
        </div>
        <p className="rd-muted rd-fs-sm">'사용 안 함'으로 바꾸면 거래처가 새로 고를 수 없고, 이미 고른 거래처에는 그대로 보입니다.</p>
      </section>
    </div>
  </SideMenuLayout></div>
}
