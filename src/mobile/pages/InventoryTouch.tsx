import { useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import TouchLayout from '../TouchLayout'
import TouchIcon, { type TouchIconName } from '../TouchIcon'
import ProductImage from '../../components/ProductImage'
import type { AccountInventoryItem } from '../../api/inventory'
import { useAccountInventory } from '../../features/inventory/useAccountInventory'
import { LOCATION_OPTIONS, getInventoryStockStatus, getLocationName, inventoryOrderPath, matchesInventoryKeyword, orderStockFirst } from '../../features/inventory/inventoryView'
import { NEW_PRODUCT, purchaseUnits, todayValue, useDirectPurchase } from '../../features/inventory/useDirectPurchase'
import { stockInputUnits } from '../../utils/quantityUnits'
import './InventoryTouch.css'

const PAGE = 48
const qty = (value?: number) => Number(value || 0).toLocaleString('ko-KR', { maximumFractionDigits: 2 })
const won = (value?: number) => `${Math.round(Number(value || 0)).toLocaleString('ko-KR')}원`
const itemKey = (item: AccountInventoryItem) => `${item.account_ingredient_product_id ?? item.inventory_balance_id ?? ''}-${item.ingredient_id}`
const isEmpty = (item: AccountInventoryItem) => Number(item.current_base_qty) <= 0

type Filter = 'all' | 'order' | 'empty' | string
const FILTER_ICON: Record<string, TouchIconName> = { all: 'inventory', order: 'alert', empty: 'box' }

function statusTone(item: AccountInventoryItem) {
  if (getInventoryStockStatus(item).needsOrder) return 'is-danger'
  if (isEmpty(item)) return 'is-warn'
  return 'is-ok'
}

/**
 * 재고 현황(태블릿·휴대폰). POS 배치: 위 분류 칸(전체·발주 필요·재고 없음·보관위치) → 상품 카드, 오른쪽 상세·실행 패널.
 * 재고 수정은 상품 하나씩(PC 표 한 행 저장과 같은 API), 직접 구매는 PC와 같은 로직(useDirectPurchase).
 */
export default function InventoryTouch() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const [accountId, setAccountId] = useState(() => params.get('account_id') || localStorage.getItem('account_id') || '')
  const inventory = useAccountInventory(accountId)
  const [keyword, setKeyword] = useState(params.get('q') ?? '')
  const [filter, setFilter] = useState<Filter>('all')
  const [limit, setLimit] = useState(PAGE)
  const [selectedKey, setSelectedKey] = useState('')
  const [sheet, setSheet] = useState<'' | 'adjust' | 'purchase'>(() => params.get('direct_purchase') === '1' ? 'purchase' : '')
  const [toast, setToast] = useState('')

  const searched = useMemo(() => orderStockFirst(inventory.items).filter(item => matchesInventoryKeyword(item, keyword)), [inventory.items, keyword])
  const counts = useMemo(() => ({
    all: searched.length,
    order: searched.filter(item => getInventoryStockStatus(item).needsOrder).length,
    empty: searched.filter(isEmpty).length,
    ...Object.fromEntries(LOCATION_OPTIONS.map(option => [option.value, searched.filter(item => item.location_id === option.value).length])),
  } as Record<string, number>), [searched])
  const shown = useMemo(() => searched.filter(item =>
    filter === 'all' ? true : filter === 'order' ? getInventoryStockStatus(item).needsOrder : filter === 'empty' ? isEmpty(item) : item.location_id === filter), [searched, filter])
  const selected = inventory.items.find(item => itemKey(item) === selectedKey) || null
  const totalAmount = inventory.items.reduce((sum, item) => sum + Number(item.inventory_amount || 0), 0)

  const filters: { key: Filter; label: string; icon: TouchIconName }[] = [
    { key: 'all', label: '전체', icon: FILTER_ICON.all },
    { key: 'order', label: '발주 필요', icon: FILTER_ICON.order },
    { key: 'empty', label: '재고 없음', icon: FILTER_ICON.empty },
    ...LOCATION_OPTIONS.map(option => ({ key: option.value as Filter, label: getLocationName(option.value), icon: 'store' as TouchIconName })),
  ]

  const toolbar = <>
    <label className="t-chip iv-search">
      <TouchIcon name="search" />
      <input type="search" value={keyword} placeholder="식재료 · 상품 · 위치 검색" onChange={e => { setKeyword(e.target.value); setLimit(PAGE) }} />
    </label>
    <button type="button" className="t-btn is-icon" aria-label="새로고침" disabled={inventory.isLoading} onClick={inventory.reload}><TouchIcon name="refresh" /></button>
  </>

  const aside = selected
    ? <DetailPanel item={selected} accountId={accountId} onClose={() => setSelectedKey('')} onAdjust={() => setSheet('adjust')} onOrder={() => navigate(inventoryOrderPath(accountId, selected))} />
    : <SummaryPanel total={inventory.items.length} amount={totalAmount} order={counts.order} empty={counts.empty} disabled={!accountId} onPurchase={() => setSheet('purchase')} />

  return <TouchLayout title="재고 현황" subtitle={accountId ? `${inventory.items.length}개 상품` : undefined} toolbar={toolbar} aside={aside}
    onAccountChange={value => { setAccountId(value); setSelectedKey(''); setLimit(PAGE) }}>
    {toast && <p className="t-msg iv-toast" role="status" onClick={() => setToast('')}><TouchIcon name="check" />{toast}</p>}

    <div className="t-tabs" role="tablist" aria-label="분류">
      {filters.map(item => <button key={item.key} type="button" role="tab" aria-selected={filter === item.key}
        className={`t-tab${filter === item.key ? ' is-active' : ''}${item.key === 'order' && counts.order > 0 ? ' iv-tab--alert' : ''}`}
        onClick={() => { setFilter(item.key); setLimit(PAGE) }}>
        <TouchIcon name={item.icon} />
        <strong>{item.label}</strong>
        <small>{counts[item.key] ?? 0}개</small>
      </button>)}
    </div>

    {!accountId && <p className="t-msg">위에서 거래처를 고르면 재고가 나옵니다.</p>}
    {inventory.error && <p className="t-msg is-error">{inventory.error}</p>}
    {accountId && inventory.isLoading && inventory.items.length === 0 && <p className="t-msg" role="status">재고를 불러오는 중…</p>}
    {accountId && !inventory.isLoading && !inventory.error && shown.length === 0 && <p className="t-msg">조건에 맞는 상품이 없습니다.</p>}

    <div className="iv-grid">
      {shown.slice(0, limit).map(item => {
        const status = getInventoryStockStatus(item)
        const key = itemKey(item)
        return <button key={key} type="button" className={`t-card iv-card${key === selectedKey ? ' is-selected' : ''}`} onClick={() => setSelectedKey(key === selectedKey ? '' : key)}>
          <span className="iv-card__image">
            <ProductImage src={item.image_url} name={item.product_name || item.ingredient_name} />
            {item.supplier_code === 'DIRECT' && <span className="t-badge is-yellow iv-card__tag">직접구매</span>}
          </span>
          <strong className="iv-card__name">{item.ingredient_name}</strong>
          <small className="iv-card__product">{item.product_name || '상품 미연결'}</small>
          <span className="iv-card__qty">
            <b>{qty(item.current_qty)}</b> {item.current_unit || item.base_unit}
            <small>{getLocationName(item.location_id)}</small>
          </span>
          <span className={`t-badge ${statusTone(item)}`}>{status.needsOrder ? '발주 필요' : isEmpty(item) ? '재고 없음' : '충분'}</span>
        </button>
      })}
    </div>
    {shown.length > limit && <button type="button" className="t-btn is-soft is-block iv-more" onClick={() => setLimit(value => value + PAGE)}>더 보기 ({shown.length - limit}개 남음)</button>}

    {sheet === 'adjust' && selected && <AdjustSheet item={selected} onClose={() => setSheet('')}
      onSave={async changes => { await inventory.saveItem(selected, changes); setSheet(''); setToast(`${selected.ingredient_name} 재고를 바꿨습니다.`) }} />}
    {sheet === 'purchase' && accountId && <PurchaseSheet accountId={accountId} items={inventory.items} onClose={() => setSheet('')}
      onDone={message => { setSheet(''); inventory.reload(); setToast(message) }} />}
  </TouchLayout>
}

function SummaryPanel({ total, amount, order, empty, disabled, onPurchase }: { total: number; amount: number; order: number; empty: number; disabled: boolean; onPurchase: () => void }) {
  return <div className="iv-panel">
    <div className="iv-panel__head">
      <h2>재고 요약</h2>
      <p>상품을 누르면 자세한 재고와 할 일이 여기에 나옵니다.</p>
    </div>
    <div className="iv-panel__body">
      <div className="iv-stats">
        <div><span>전체 상품</span><strong>{total}개</strong></div>
        <div className={order ? 'is-danger' : ''}><span>발주 필요</span><strong>{order}개</strong></div>
        <div className={empty ? 'is-warn' : ''}><span>재고 없음</span><strong>{empty}개</strong></div>
      </div>
      <div className="t-summary">
        <div className="is-total"><span>재고 금액</span><span>{won(amount)}</span></div>
      </div>
      <p className="iv-panel__hint">마트·쿠팡 등에서 급하게 산 식재료는 직접 구매로 넣으면 재고와 단가에 바로 반영됩니다.</p>
    </div>
    <div className="iv-panel__actions">
      <button type="button" className="t-btn is-primary is-large is-block" disabled={disabled} onClick={onPurchase}><TouchIcon name="order" />직접 구매 입력</button>
    </div>
  </div>
}

function DetailPanel({ item, accountId, onClose, onAdjust, onOrder }: { item: AccountInventoryItem; accountId: string; onClose: () => void; onAdjust: () => void; onOrder: () => void }) {
  const status = getInventoryStockStatus(item)
  const unit = item.base_unit
  return <div className="iv-panel">
    <div className="iv-panel__head iv-panel__head--detail">
      <span className="iv-panel__image"><ProductImage src={item.image_url} name={item.product_name || item.ingredient_name} /></span>
      <div>
        <h2>{item.ingredient_name}</h2>
        <p>{item.product_name || '상품 미연결'}{item.supplier_name ? ` · ${item.supplier_name}` : ''}</p>
      </div>
      <button type="button" className="t-btn is-icon is-ghost" aria-label="닫기" onClick={onClose}><TouchIcon name="close" /></button>
    </div>
    <div className="iv-panel__body">
      <div className={`iv-status ${statusTone(item)}`}>
        <strong>{status.needsOrder ? '발주가 필요합니다' : isEmpty(item) ? '재고가 없습니다' : '재고가 충분합니다'}</strong>
        <span>{status.label}</span>
      </div>
      <div className="iv-big">
        <span>현재고</span>
        <strong>{qty(item.current_qty)} <small>{item.current_unit || unit}</small></strong>
        <span>{getLocationName(item.location_id)}</span>
      </div>
      <div className="t-summary">
        <div><span>안전재고</span><span>{qty(item.safe_stock_qty)} {unit}</span></div>
        <div><span>예상 필요량</span><span>{qty(item.required_qty)} {unit}</span></div>
        <div><span>부족량</span><span>{qty(item.shortage_qty)} {unit}</span></div>
        <div><span>발주 필요량</span><span>{qty(item.order_needed_qty)} {unit}</span></div>
        <div><span>평균 단가</span><span>{(item.average_unit_cost ?? 0) > 0 ? `${qty(item.average_unit_cost)}원/${unit}` : '입고 전'}{item.opening_cost_estimated ? ' (추정)' : ''}</span></div>
        <div className="is-total"><span>재고 금액</span><span>{won(item.inventory_amount)}</span></div>
      </div>
    </div>
    <div className="iv-panel__actions">
      {status.needsOrder && <button type="button" className="t-btn is-primary is-large is-block" onClick={onOrder}><TouchIcon name="order" />발주하러 가기</button>}
      <div className="iv-panel__row">
        <button type="button" className={`t-btn is-block ${status.needsOrder ? 'is-soft' : 'is-primary is-large'}`} disabled={!item.inventory_balance_id && !item.account_ingredient_product_id} onClick={onAdjust}>재고 수정</button>
        {item.account_ingredient_product_id
          ? <Link className="t-btn is-soft is-block" to={`/inventory/history?${new URLSearchParams({ account_id: accountId, account_ingredient_product_id: String(item.account_ingredient_product_id) })}`}>변동 이력</Link>
          : null}
      </div>
    </div>
  </div>
}

function AdjustSheet({ item, onClose, onSave }: {
  item: AccountInventoryItem
  onClose: () => void
  onSave: (changes: Pick<AccountInventoryItem, 'current_qty' | 'current_unit' | 'location_id'>) => Promise<void>
}) {
  const units = stockInputUnits(item.base_unit, item.order_unit, item.package_base_qty) ?? [item.base_unit]
  const [value, setValue] = useState(String(item.current_qty ?? 0))
  const [unit, setUnit] = useState(item.current_unit && units.includes(item.current_unit) ? item.current_unit : units[0])
  const [location, setLocation] = useState(item.location_id || 'L999')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const number = Number(value)
  const valid = value !== '' && Number.isFinite(number) && number >= 0
  const bump = (delta: number) => setValue(String(Math.max(0, Math.round(((Number(value) || 0) + delta) * 1000) / 1000)))

  const save = async () => {
    if (!valid) return
    setBusy(true); setError('')
    try { await onSave({ current_qty: number, current_unit: unit, location_id: location }) }
    catch (e) { setError(e instanceof Error ? e.message : '재고를 저장하지 못했습니다.') }
    finally { setBusy(false) }
  }

  return <div className="t-sheet-backdrop" role="presentation" onClick={() => !busy && onClose()}>
    <section className="t-sheet" role="dialog" aria-modal="true" aria-labelledby="iv-adjust-title" onClick={e => e.stopPropagation()}>
      <header className="t-sheet__head">
        <h2 id="iv-adjust-title">{item.ingredient_name} 재고 수정</h2>
        <p>실제로 세어 본 수량으로 바꾸면 차이만큼 조정 기록이 남습니다.</p>
      </header>
      <div className="t-sheet__body iv-form">
        {error && <p className="t-msg is-error" role="alert">{error}</p>}
        <label className="iv-form__label">현재고</label>
        <div className="iv-qty">
          <button type="button" className="t-round" aria-label="1 줄이기" disabled={busy} onClick={() => bump(-1)}>−</button>
          <input type="text" inputMode="decimal" aria-label="현재고" value={value} disabled={busy} onChange={e => setValue(e.target.value.replace(/[^0-9.]/g, ''))} />
          <button type="button" className="t-round" aria-label="1 늘리기" disabled={busy} onClick={() => bump(1)}>+</button>
        </div>
        <label className="iv-form__label">단위</label>
        <div className="t-segment">{units.map(option => <button key={option} type="button" className={unit === option ? 'is-active' : ''} onClick={() => setUnit(option)}>
          {option === item.order_unit && item.package_base_qty ? `${option} (${qty(item.package_base_qty)}${item.base_unit})` : option}
        </button>)}</div>
        <label className="iv-form__label">보관 위치</label>
        <div className="t-segment iv-wrap">{LOCATION_OPTIONS.map(option => <button key={option.value} type="button" className={location === option.value ? 'is-active' : ''} onClick={() => setLocation(option.value)}>
          {getLocationName(option.value)}
        </button>)}</div>
      </div>
      <footer className="t-sheet__actions">
        <button type="button" className="t-btn is-large" disabled={busy} onClick={onClose}>닫기</button>
        <button type="button" className="t-btn is-primary is-large" disabled={busy || !valid} onClick={() => void save()}>{busy ? '저장 중…' : '저장'}</button>
      </footer>
    </section>
  </div>
}

function PurchaseSheet({ accountId, items, onClose, onDone }: { accountId: string; items: AccountInventoryItem[]; onClose: () => void; onDone: (message: string) => void }) {
  const p = useDirectPurchase(accountId, items, result => onDone(result.replayed
    ? '이미 기록된 직접 구매입니다. 재고에 다시 더하지 않았습니다.'
    : `${result.product_name} ${Number(result.base_qty).toLocaleString('ko-KR')}${result.base_unit}를 재고에 넣었습니다.`))
  const step = p.ingredient ? 2 : 1

  return <div className="t-sheet-backdrop" role="presentation" onClick={() => !p.saving && onClose()}>
    <section className="t-sheet iv-purchase" role="dialog" aria-modal="true" aria-labelledby="iv-purchase-title" onClick={e => e.stopPropagation()}>
      <header className="t-sheet__head">
        <h2 id="iv-purchase-title">직접 구매 입력</h2>
        <p>{step === 1 ? '1단계 · 산 식재료를 고르세요' : '2단계 · 수량과 결제 금액을 넣으세요'}</p>
        <div className="t-steps" aria-hidden="true"><span className="is-done" /><span className={step === 2 ? 'is-done' : ''} /></div>
      </header>
      <div className="t-sheet__body iv-form">
        {p.loadError && <p className="t-msg is-warn">{p.loadError} 재고에 있는 식재료만 보입니다.</p>}
        {p.error && <p className="t-msg is-error" role="alert">{p.error}</p>}

        {step === 1 && <>
          <label className="t-chip iv-search iv-search--block">
            <TouchIcon name="search" />
            <input type="search" value={p.query} placeholder="예: 양파" autoFocus onChange={e => p.setQuery(e.target.value)} />
          </label>
          <div className="iv-pick">
            {p.filtered.slice(0, 60).map(option => <button key={option.ingredient_id} type="button" onClick={() => p.selectIngredient(option.ingredient_id)}>
              <strong>{option.ingredient_name}</strong><small>{option.base_unit}</small>
            </button>)}
          </div>
          {p.filtered.length > 60 && <p className="tm-note">{p.filtered.length - 60}개 더 있습니다. 이름을 더 입력해 찾으세요.</p>}
        </>}

        {step === 2 && p.ingredient && <>
          <div className="iv-picked">
            <span className="t-dot">{p.ingredient.ingredient_name.slice(0, 1)}</span>
            <div><strong>{p.ingredient.ingredient_name}</strong><small>기준 단위 {p.ingredient.base_unit}</small></div>
            <button type="button" className="t-btn is-small is-soft" disabled={p.saving} onClick={() => p.selectIngredient('')}>다시 고르기</button>
          </div>

          <label className="iv-form__label">상품</label>
          <div className="t-segment iv-wrap">
            {p.directProducts.map(product => <button key={product.account_ingredient_product_id} type="button"
              className={p.productChoice === String(product.account_ingredient_product_id) ? 'is-active' : ''}
              onClick={() => p.setProductChoice(String(product.account_ingredient_product_id))}>{product.product_name}</button>)}
            <button type="button" className={p.productChoice === NEW_PRODUCT ? 'is-active' : ''} onClick={() => p.setProductChoice(NEW_PRODUCT)}>새 상품</button>
          </div>
          {p.productChoice === NEW_PRODUCT && <input className="iv-input" aria-label="상품명" value={p.productName} maxLength={255} placeholder="예: 양파 (쿠팡)" onChange={e => p.setProductName(e.target.value)} />}

          <div className="iv-form__grid">
            <div>
              <label className="iv-form__label">수량</label>
              <div className="iv-inline">
                <input className="iv-input" type="text" inputMode="decimal" aria-label="구매 수량" value={p.quantity} placeholder="0" onChange={e => p.setQuantity(e.target.value.replace(/[^0-9.]/g, ''))} />
                <div className="t-segment">{purchaseUnits(p.ingredient.base_unit).map(option => <button key={option} type="button" className={p.unit === option ? 'is-active' : ''} onClick={() => p.setUnit(option)}>{option}</button>)}</div>
              </div>
            </div>
            <div>
              <label className="iv-form__label">결제 금액 (원)</label>
              <input className="iv-input" type="text" inputMode="numeric" aria-label="결제 금액" value={p.amount} placeholder="0" onChange={e => p.setAmount(e.target.value.replace(/[^0-9]/g, ''))} />
            </div>
            <div>
              <label className="iv-form__label">구매일</label>
              <input className="iv-input" type="date" aria-label="구매일" value={p.purchaseDate} max={todayValue()} onChange={e => p.setPurchaseDate(e.target.value)} />
            </div>
            <div>
              <label className="iv-form__label">소비기한 (선택)</label>
              <input className="iv-input" type="date" aria-label="소비기한" value={p.expirationDate} onChange={e => p.setExpirationDate(e.target.value)} />
            </div>
          </div>

          <div className="t-summary">
            <div><span>재고에 들어갈 양</span><span>{p.baseQty > 0 ? `${qty(p.baseQty)} ${p.ingredient.base_unit}` : '-'}</span></div>
            <div className="is-total"><span>입고 단가</span><span>{p.unitCost > 0 ? `${qty(p.unitCost)}원/${p.ingredient.base_unit}` : '-'}</span></div>
          </div>
        </>}
      </div>
      <footer className="t-sheet__actions">
        <button type="button" className="t-btn is-large" disabled={p.saving} onClick={onClose}>닫기</button>
        {step === 2 && <button type="button" className="t-btn is-primary is-large" disabled={!p.ready || p.saving} onClick={() => void p.save()}>{p.saving ? '넣는 중…' : '재고에 넣기'}</button>}
      </footer>
    </section>
  </div>
}
