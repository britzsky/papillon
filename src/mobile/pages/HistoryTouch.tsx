import { useMemo, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import TouchLayout from '../TouchLayout'
import TouchIcon, { type TouchIconName } from '../TouchIcon'
import type { InventoryMovement } from '../../api/inventory'
import {
  HISTORY_PAGE_SIZE, TYPE_META, TYPE_TABS, historyQty as qty, historyWon as won, referenceText, shortDate, signed, useInventoryHistory,
} from '../../features/inventory/useInventoryHistory'
import './HistoryTouch.css'

const TAB_ICON: Record<string, TouchIconName> = { all: 'inventory', in: 'truck', out: 'meals', return: 'refresh', adjust: 'alert', opening: 'box' }
const PERIODS: { days: number; label: string }[] = [{ days: 0, label: '오늘' }, { days: 7, label: '7일' }, { days: 30, label: '30일' }, { days: 90, label: '90일' }]
const TONE_CLASS: Record<string, string> = { success: 'is-in', warning: 'is-out', danger: 'is-danger', neutral: 'is-neutral' }
const dayTitle = (date: string) => {
  const d = new Date(`${date}T00:00:00`)
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${'일월화수목금토'[d.getDay()]})`
}

/**
 * 재고 변동 이력(태블릿·휴대폰). 위 구분 칸 → 날짜별 변동 카드, 오른쪽에 기간 합계. 로직은 PC와 같은 useInventoryHistory.
 * 상품 이름을 누르면 그 상품 이력만 본다(주소의 account_ingredient_product_id).
 */
export default function HistoryTouch() {
  const [params, setParams] = useSearchParams()
  const [accountId, setAccountId] = useState(() => params.get('account_id') || localStorage.getItem('account_id') || '')
  const productId = params.get('account_ingredient_product_id') || ''
  const ingredientId = params.get('ingredient_id') || ''
  const h = useInventoryHistory(accountId, productId, ingredientId)
  const [keywordInput, setKeywordInput] = useState('')
  const [period, setPeriod] = useState(30)

  const countByTab = useMemo(() => Object.fromEntries(TYPE_TABS.map(tab => [tab.key, tab.types
    ? h.orderedSummary.filter(item => tab.types.split(',').includes(item.movement_type)).reduce((sum, item) => sum + item.movement_count, 0)
    : h.total])), [h.orderedSummary, h.total])
  // 구분 탭을 바꾸면 합계도 그 구분만 오므로, '전체'일 때만 칸에 건수를 보인다
  const showCounts = h.tab === 'all'

  const days = useMemo(() => {
    const map = new Map<string, InventoryMovement[]>()
    for (const row of h.rows) { const key = String(row.movement_at).slice(0, 10); map.set(key, [...(map.get(key) || []), row]) }
    return [...map.entries()]
  }, [h.rows])

  const submit = (event: FormEvent) => { event.preventDefault(); h.setKeyword(keywordInput.trim()) }
  const choosePeriod = (days: number) => { setPeriod(days); h.setPeriod(days) }
  const focusProduct = (row: InventoryMovement) => { h.setFocusName(row.ingredient_name || row.product_name || ''); setParams({ account_id: accountId, account_ingredient_product_id: String(row.account_ingredient_product_id) }) }

  const toolbar = <>
    <form className="t-chip hs-search" onSubmit={submit}>
      <TouchIcon name="search" />
      <input type="search" value={keywordInput} placeholder="식재료 · 상품 검색" onChange={e => setKeywordInput(e.target.value)} onBlur={() => h.setKeyword(keywordInput.trim())} />
    </form>
    <div className="t-segment" role="group" aria-label="기간">
      {PERIODS.map(p => <button key={p.days} type="button" className={period === p.days ? 'is-active' : ''} onClick={() => choosePeriod(p.days)}>{p.label}</button>)}
    </div>
  </>

  return <TouchLayout title="재고 변동 이력" subtitle={`${h.from} ~ ${h.to}`} toolbar={toolbar} aside={<SummaryPanel h={h} />}
    onAccountChange={value => { setAccountId(value); h.setFocusName(''); setParams(value ? { account_id: value } : {}) }}>
    {(productId || ingredientId || h.keyword) && <div className="hs-focus">
      {(productId || ingredientId) && <span className="t-chip"><strong>{h.focusName || '선택한 상품'}</strong> 이력만 보는 중
        <button type="button" className="t-btn is-small is-soft" onClick={() => { h.setFocusName(''); setParams({ account_id: accountId }) }}>전체 보기</button></span>}
      {h.keyword && <span className="t-chip">검색어 <strong>{h.keyword}</strong>
        <button type="button" className="t-btn is-small is-soft" onClick={() => { h.setKeyword(''); setKeywordInput('') }}>지우기</button></span>}
    </div>}

    <div className="t-tabs" role="tablist" aria-label="변동 구분">
      {TYPE_TABS.map(tab => <button key={tab.key} type="button" role="tab" aria-selected={h.tab === tab.key}
        className={`t-tab${h.tab === tab.key ? ' is-active' : ''}`} onClick={() => h.setTab(tab.key)}>
        <TouchIcon name={TAB_ICON[tab.key]} />
        <strong>{tab.label}</strong>
        <small>{showCounts ? `${(countByTab[tab.key] ?? 0).toLocaleString('ko-KR')}건` : ' '}</small>
      </button>)}
    </div>

    {!accountId && <p className="t-msg">위에서 거래처를 고르면 이력이 나옵니다.</p>}
    {h.error && <p className="t-msg is-error">{h.error}</p>}
    {h.loading && <p className="t-msg" role="status">이력을 불러오는 중…</p>}
    {h.ready && !h.loading && !h.error && h.rows.length === 0 && <p className="t-msg">이 기간에 재고 변동이 없습니다.</p>}

    {days.map(([date, rows]) => <section key={date} className="hs-day">
      <h2 className="t-section-title">{dayTitle(date)}<small>{rows.length}건</small></h2>
      <ul className="hs-list">
        {rows.map(row => {
          const meta = TYPE_META[row.movement_type] ?? { label: row.movement_type, tone: 'neutral' as const }
          const reference = referenceText(row)
          const delta = Number(row.quantity_delta)
          return <li key={row.movement_id} className={`t-card hs-row ${TONE_CLASS[meta.tone]}`}>
            <span className="hs-row__type">{meta.label}</span>
            <div className="hs-row__main">
              <button type="button" className="hs-row__name" onClick={() => focusProduct(row)}>{row.ingredient_name || row.product_name || '상품정보 없음'}</button>
              <small>{reference.title}{reference.detail ? ` · ${reference.detail}` : ''}</small>
              <small>{String(row.movement_at).slice(11, 16)} · {row.user_id || '시스템'}{row.product_name && row.product_name !== row.ingredient_name ? ` · ${row.product_name}` : ''}</small>
              {row.purchase_order_id && <Link className="hs-row__link" to={`/order_manager/orders?${new URLSearchParams({ account_id: accountId, purchase_order_id: row.purchase_order_id })}`}>
                발주서 보기{row.requested_delivery_date ? ` (납품 ${shortDate(row.requested_delivery_date)})` : ''}
              </Link>}
            </div>
            <div className="hs-row__delta">
              <strong>{signed(delta, qty(delta))} <small>{row.base_unit}</small></strong>
              <small>{qty(row.quantity_before)} → {qty(row.quantity_after)}</small>
              {row.amount_delta != null && <small>{signed(Number(row.amount_delta), won(Number(row.amount_delta)))}</small>}
            </div>
          </li>
        })}
      </ul>
    </section>)}

    {h.total > HISTORY_PAGE_SIZE && <div className="hs-pages">
      <button type="button" className="t-btn is-soft" disabled={h.loading || h.offset === 0} onClick={() => h.movePage(h.offset - HISTORY_PAGE_SIZE)}>이전</button>
      <span>{h.rows.length ? `${h.offset + 1}-${h.offset + h.rows.length}` : '0'} / {h.total.toLocaleString('ko-KR')}건</span>
      <button type="button" className="t-btn is-soft" disabled={h.loading || h.offset + h.rows.length >= h.total} onClick={() => h.movePage(h.offset + HISTORY_PAGE_SIZE)}>다음</button>
    </div>}
  </TouchLayout>
}

function SummaryPanel({ h }: { h: ReturnType<typeof useInventoryHistory> }) {
  return <div className="hs-panel">
    <div className="hs-panel__head">
      <h2>기간 합계</h2>
      <p>{h.from} ~ {h.to}</p>
    </div>
    <div className="hs-panel__body">
      <div className={`hs-net ${h.netAmount >= 0 ? 'is-plus' : 'is-minus'}`}>
        <span>재고 금액 순증감</span>
        <strong>{signed(h.netAmount, won(h.netAmount))}</strong>
        <small>{h.total.toLocaleString('ko-KR')}건</small>
      </div>
      {h.orderedSummary.length === 0 && <p className="hs-panel__empty">합계가 없습니다.</p>}
      <ul className="hs-sum">
        {h.orderedSummary.map(item => {
          const meta = TYPE_META[item.movement_type] ?? { label: item.movement_type, tone: 'neutral' as const }
          return <li key={item.movement_type} className={TONE_CLASS[meta.tone]}>
            <span className="hs-sum__dot" />
            <div><strong>{meta.label}</strong><small>{item.movement_count.toLocaleString('ko-KR')}건</small></div>
            <div className="hs-sum__value">
              <strong>{signed(item.amount_sum, won(item.amount_sum))}</strong>
              {h.showQty && <small>{signed(item.quantity_sum, qty(item.quantity_sum))} {item.base_unit}</small>}
            </div>
          </li>
        })}
      </ul>
      {!h.showQty && h.orderedSummary.length > 0 && <p className="hs-panel__empty">여러 상품을 함께 볼 때는 수량 합계를 표시하지 않습니다.</p>}
    </div>
  </div>
}
