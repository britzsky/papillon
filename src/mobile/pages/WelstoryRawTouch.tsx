import { useState } from 'react'
import { Link } from 'react-router-dom'
import TouchLayout from '../TouchLayout'
import TouchIcon from '../TouchIcon'
import ProductImage from '../../components/ProductImage'
import { money, text, useWelstoryRaw } from '../../features/order/useWelstoryRaw'
import './WelstoryRawTouch.css'

const TABS = [
  { key: 'products', label: '상품·판가' },
  { key: 'orders', label: '주문 내역' },
  { key: 'receives', label: '입고 내역' },
  { key: 'situations', label: '반품·교환' },
] as const
const PAGE = 60

/**
 * 웰스토리 원문 조회(태블릿·휴대폰, 조회 전용): 사업장·판가 연도·순기 → 상품 카드, 또는 날짜별 주문·입고·반품교환 원문.
 * 주문은 발주하기에서만 한다(여기서 주문하면 발주서·재고에 남지 않음). 로직은 PC와 같은 useWelstoryRaw.
 */
export default function WelstoryRawTouch() {
  const w = useWelstoryRaw()
  const [limit, setLimit] = useState(PAGE)

  const toolbar = <label className="t-chip t-chip--select wr-site"><TouchIcon name="store" />
    <select aria-label="웰스토리 사업장" value={w.soldTo} onChange={e => w.saveSoldTo(e.target.value)}>
      <option value="">사업장 선택</option>{w.workplaces.map(item => <option key={item.soldTo} value={item.soldTo}>{item.soldToNm || item.soldTo} ({item.soldTo})</option>)}
    </select>
  </label>

  const aside = <div className="wr-panel">
    <div className="wr-panel__head"><h2>주문은 발주하기에서</h2><p>이 화면은 웰스토리 원문 조회 전용입니다. 여기서 주문하면 발주서·입고·재고에 남지 않아 주문 전송을 막았습니다.</p></div>
    <div className="wr-panel__body">
      <div className="t-summary">
        <div><span>사업장</span><span>{w.selectedWorkplace?.soldToNm || w.soldTo || '-'}</span></div>
        <div><span>정산처</span><span>{w.selectedWorkplace?.payerNm || '-'}</span></div>
        <div className="is-total"><span>{w.tab === 'products' ? '상품' : '내역'}</span><span>{w.tab === 'products' ? `${w.filtered.length}개` : `${w.records.length}건`}</span></div>
      </div>
    </div>
    <div className="wr-panel__actions">
      <Link className="t-btn is-primary is-large is-block" to="/order_manager/order">발주하기로 이동</Link>
      <Link className="t-btn is-soft is-block" to="/order_manager/suppliers">공급사 연동으로</Link>
    </div>
  </div>

  return <TouchLayout title="웰스토리 원문 조회" subtitle="삼성웰스토리 · 조회 전용" toolbar={toolbar} aside={aside} hideAccount>
    <div className="t-segment t-method" role="tablist" aria-label="조회 종류">
      {TABS.map(item => <button key={item.key} type="button" className={w.tab === item.key ? 'is-active' : ''} disabled={w.busy}
        onClick={() => item.key === 'products' ? w.setTab('products') : void w.loadRecords(item.key)}>{item.label}</button>)}
    </div>

    <section className="t-card wr-filters">
      {w.tab === 'products' ? <>
        <label className="wr-field">판가 연도<input inputMode="numeric" maxLength={4} value={w.periodYear} onChange={e => w.setPeriodYear(e.target.value.replace(/\D/g, '').slice(0, 4))} /></label>
        <label className="wr-field">순기<input inputMode="numeric" maxLength={2} placeholder="예: 12" value={w.periodGroup} onChange={e => w.setPeriodGroup(e.target.value.replace(/\D/g, '').slice(0, 2))} /></label>
        <button type="button" className="t-btn is-primary" disabled={w.busy} onClick={() => void w.loadProducts()}>{w.busy ? '조회 중…' : '전체 판가 조회'}</button>
        <label className="t-chip wr-search"><TouchIcon name="search" /><input type="search" value={w.query} placeholder="품목코드 · 품명 · 규격" onChange={e => { w.setQuery(e.target.value); setLimit(PAGE) }} /></label>
      </> : <>
        <label className="wr-field">날짜<input type="date" value={w.deliveryDate} onChange={e => w.setDeliveryDate(e.target.value)} /></label>
        <button type="button" className="t-btn is-primary" disabled={w.busy} onClick={() => void w.loadRecords(w.tab)}>{w.busy ? '조회 중…' : '다시 조회'}</button>
      </>}
    </section>

    {w.message && <p className="t-msg is-error" role="alert">{w.message}</p>}

    {w.tab === 'products' && <>
      {!w.filtered.length && <p className="t-msg">{w.busy ? '상품을 불러오는 중…' : w.products.length ? '검색어에 맞는 상품이 없습니다.' : '사업장과 판가 연도·순기를 넣고 전체 판가를 조회하세요.'}</p>}
      <div className="wr-grid">{w.filtered.slice(0, limit).map(item => <article key={item.itemCode} className="t-card wr-item">
        <span className="wr-item__img"><ProductImage src={item.image_url} name={item.itemName || item.itemCode} /></span>
        <span className={`t-badge ${!item.stopType || item.stopType === 'NORMAL' ? 'is-ok' : 'is-warn'}`}>{item.stopType || '정상'}</span>
        <strong>{item.itemName || item.itemCode}</strong>
        <small>규격 {item.standard || '—'} · {item.unit || '—'}</small>
        <small>{item.itemCode} · 최소 {item.minQntty || 1} · 배수 {item.orderIncrs || 1}</small>
        <span className="wr-item__price">{money(item.price)}원<small>/{item.unit || '단위'}</small></span>
      </article>)}</div>
      {w.filtered.length > limit && <button type="button" className="t-btn is-soft is-block wr-more" onClick={() => setLimit(v => v + PAGE)}>더 보기 ({w.filtered.length - limit}개 남음)</button>}
    </>}

    {w.tab !== 'products' && <>
      {!w.busy && !w.records.length && <p className="t-msg">이 날짜의 내역이 없습니다.</p>}
      <div className="wr-records">{w.records.map((row, index) => <article key={index} className="t-card wr-record">
        <dl>{Object.entries(row).slice(0, 12).map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{text(value)}</dd></div>)}</dl>
        {w.tab === 'orders' && text(row.confirmYn) === 'Y' && <span className="t-badge is-warn">확정됨 · 수정/삭제 불가</span>}
      </article>)}</div>
    </>}
  </TouchLayout>
}
