import { useEffect, useState } from 'react'
import { buildApiUrl } from '../config/api'
import { getLocalUserId } from '../api/inventory'
import { planningCostSourceLabels } from '../utils/planningCost'

type Preview = {
  base_unit: string; expected_version: number
  auto: { source_type: string; unit_cost: number; source_date: string } | null
  manual: { unit_cost: number; source_date: string } | null
  history: { unit_cost: number | null; base_unit: string; source_type: string; confirmed_at: string }[]
}
const won = (value: number) => `${Number(value).toLocaleString('ko-KR', { maximumFractionDigits: 4 })}원`

/**
 * 메뉴 편성 단가(거래처 식재료 단위, 2026-10-22). 자동 단가 = 공급사 판가(이 식재료로 입고·발주한 상품, 거래처 사업장 → 공통) → 입고 단가(재고 평균, 없으면 최근 입고) → 본사 표준 단가.
 * 필요할 때만 직접 입력한다.
 */
export default function PlanningCostEditor({ accountId, ingredientId, disabled = false, onSaved }: {
  accountId: string; ingredientId: string; disabled?: boolean; onSaved?: () => void
}) {
  const [data, setData] = useState<Preview | null>(null)
  const [amount, setAmount] = useState('')
  const [error, setError] = useState(''), [message, setMessage] = useState(''), [busy, setBusy] = useState(false), [revision, setRevision] = useState(0)
  useEffect(() => {
    let active = true
    setData(null); setError('')
    const query = new URLSearchParams({ account_id: accountId, ingredient_id: ingredientId })
    void fetch(buildApiUrl(`/v2/menu-management/planning-cost?${query}`)).then(async response => {
      const body = await response.json(); if (!response.ok) throw new Error(body.message || '단가 조회 실패'); return body as Preview
    }).then(body => { if (!active) return; setData(body); setAmount(body.manual ? String(body.manual.unit_cost) : '') })
      .catch(e => { if (active) setError(e instanceof Error ? e.message : '단가 조회 실패') })
    return () => { active = false }
  }, [accountId, ingredientId, revision])

  const valid = /^\d+(\.\d{1,6})?$/.test(amount) && Number(amount) > 0
  const submit = async (sourceType: 'MANUAL' | 'AUTO') => {
    if (!data || busy || (sourceType === 'MANUAL' && !valid)) return
    setBusy(true); setError(''); setMessage('')
    try {
      const response = await fetch(buildApiUrl('/v2/menu-management/planning-cost'), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account_id: accountId, ingredient_id: ingredientId, source_type: sourceType,
          unit_cost: sourceType === 'MANUAL' ? amount : null, base_unit: data.base_unit, expected_version: data.expected_version, user_id: getLocalUserId() }),
      })
      const body = await response.json(); if (!response.ok) throw new Error(body.message || '단가 저장 실패')
      setMessage(sourceType === 'MANUAL' ? '직접 입력한 단가를 적용했습니다.' : '자동 단가로 되돌렸습니다.')
      setRevision(r => r + 1); onSaved?.()
    } catch (e) { setError(e instanceof Error ? e.message : '단가 저장 실패') } finally { setBusy(false) }
  }

  return <section className="ingredient-link-selection" aria-label="메뉴 편성 단가">
    <strong>메뉴 편성 단가</strong>
    <p>식단 예상 원가 계산에 쓰는 단가입니다. 기본은 이 식재료로 입고·발주한 웰스토리·아워홈 상품의 판가, 판가가 없으면 입고 단가, 그다음 본사 표준 단가로 자동 계산합니다. 맞지 않을 때만 직접 입력하세요. 저장된 식단과 실제 사용 원가는 바뀌지 않습니다.</p>
    {error && <p role="alert">{error} <button type="button" onClick={() => setRevision(r => r + 1)} disabled={busy || disabled}>다시 조회</button></p>}
    {!data && !error && <p>단가 조회 중…</p>}
    {data && <>
      <p>자동 단가: {data.auto ? `${won(data.auto.unit_cost)}/${data.base_unit} · ${planningCostSourceLabels[data.auto.source_type] ?? data.auto.source_type} · 기준일 ${data.auto.source_date}` : '가격 정보 없음'}</p>
      <p>적용 중: {data.manual ? `직접 입력 ${won(data.manual.unit_cost)}/${data.base_unit} (${data.manual.source_date})` : data.auto ? '자동 단가' : '없음 — 원가 미산정'}</p>
      <label>직접 입력 <input aria-label="직접 입력 단가" type="number" min="0.000001" step="0.000001" value={amount} disabled={busy || disabled} onChange={e => setAmount(e.target.value)} /> 원/{data.base_unit}</label>
      <button type="button" disabled={!valid || busy || disabled} onClick={() => void submit('MANUAL')}>직접 입력 단가 적용</button>
      {data.manual && <button type="button" disabled={busy || disabled} onClick={() => void submit('AUTO')}>자동 단가로 되돌리기</button>}
      {data.history.length > 0 && <details><summary>변경 이력</summary>{data.history.map((c, i) => <p key={i}>{c.confirmed_at} · {c.source_type === 'AUTO' ? '자동 단가로 되돌림' : `직접 입력 ${won(Number(c.unit_cost))}/${c.base_unit}`}</p>)}</details>}
    </>}
    {message && <p role="status">{message}</p>}
  </section>
}
