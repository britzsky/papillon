import { useCallback, useEffect, useMemo, useState } from 'react'
import HeaderBar from '../../components/HeaderBar'
import SideMenuLayout from '../../components/SideMenuLayout'
import {
  getCategories, getPartners, getSeller, PARTNER_TYPE_LABEL, PO_METHOD_LABEL, saveCategory, savePartner, saveSeller, text, type Row,
} from '../../api/distAdmin'
import { Fields, Notice, type FieldDef } from './DistFields'
import { runAction } from './distActions'
import './DistAdmin.css'

const SELLER_FIELDS: FieldDef[] = [
  { key: 'seller_name', label: '상호', required: true, maxLength: 100 },
  { key: 'biz_no', label: '사업자등록번호', required: true, placeholder: '000-00-00000', maxLength: 20 },
  { key: 'ceo_name', label: '대표자', maxLength: 50 },
  { key: 'mail_order_reg_no', label: '통신판매업 신고번호', maxLength: 50, hint: '개인 판매를 하려면 필요합니다.' },
  { key: 'biz_type', label: '업태', maxLength: 100 },
  { key: 'biz_item', label: '종목', maxLength: 100 },
  { key: 'phone', label: '대표 전화', type: 'tel', maxLength: 30 },
  { key: 'email', label: '대표 이메일', type: 'email', maxLength: 100, hint: '세금계산서 발행 등' },
  { key: 'zipcode', label: '우편번호', maxLength: 10 },
  { key: 'address1', label: '주소', wide: true, maxLength: 255 },
  { key: 'address2', label: '상세주소', wide: true, maxLength: 255 },
  { key: 'deposit_bank_name', label: '입금 은행', maxLength: 50, hint: '무통장 입금 주문에 안내하는 계좌' },
  { key: 'deposit_account_no', label: '입금 계좌번호', maxLength: 30 },
  { key: 'deposit_account_holder', label: '예금주', maxLength: 50 },
  { key: 'deposit_due_days', label: '입금 기한(일)', type: 'number', hint: '주문 후 며칠 안에 입금' },
]

const partnerFields = (carriers: Record<string, string>): FieldDef[] => [
  { key: 'partner_code', label: '협력사 코드', required: true, placeholder: '예: WANDO_SEA', maxLength: 30, hint: '영문 대문자·숫자·-·_' },
  { key: 'partner_name', label: '협력사명', required: true, maxLength: 100 },
  { key: 'partner_type', label: '공급 방식', required: true, options: PARTNER_TYPE_LABEL, hint: '직송 공급 = 협력사가 고객에게 바로 발송' },
  { key: 'biz_no', label: '사업자등록번호', maxLength: 20 },
  { key: 'ceo_name', label: '대표자', maxLength: 50 },
  { key: 'manager_name', label: '담당자', maxLength: 50 },
  { key: 'manager_phone', label: '담당자 연락처', type: 'tel', maxLength: 30 },
  { key: 'manager_email', label: '담당자 이메일', type: 'email', maxLength: 100 },
  { key: 'po_send_method', label: '발주서 전달 방식', required: true, options: PO_METHOD_LABEL },
  { key: 'po_send_target', label: '발주서 받는 곳', maxLength: 255, placeholder: '이메일·휴대폰 번호' },
  { key: 'default_carrier_code', label: '주로 쓰는 택배사', options: carriers },
  { key: 'order_cutoff_time', label: '당일 출고 마감', type: 'time' },
  { key: 'lead_time_days', label: '출고까지 걸리는 날', type: 'number', hint: '주문 후 며칠 뒤 출고되는지' },
  { key: 'settle_cycle', label: '정산 주기', options: { MONTHLY: '월 1회', BIWEEKLY: '2주', WEEKLY: '매주' } },
  { key: 'zipcode', label: '우편번호', maxLength: 10 },
  { key: 'address1', label: '출고지 주소', wide: true, maxLength: 255 },
  { key: 'address2', label: '상세주소', wide: true, maxLength: 255 },
]

const NEW_PARTNER: Row = { partner_type: 'DROP_SHIPPER', po_send_method: 'MANUAL', lead_time_days: '1', active_yn: 'Y' }

/**
 * 협력사 관리 › 협력사·기본 설정(본사 전용, 2026-11-02). 판매 주체(더채움 사업자 정보, 상품 등록 전에 필요)·협력사·상품 카테고리.
 * 1단계는 본사가 협력사 정보를 대신 입력한다(협력사 로그인은 미정).
 */
export default function DistPartners() {
  const [seller, setSeller] = useState<Row>({})
  const [sellerSaved, setSellerSaved] = useState(false)
  const [partners, setPartners] = useState<Row[]>([])
  const [carriers, setCarriers] = useState<Row[]>([])
  const [partner, setPartner] = useState<Row | null>(null)
  const [categories, setCategories] = useState<Row[]>([])
  const [categoryDrafts, setCategoryDrafts] = useState<Record<string, Row>>({})
  const [newCategory, setNewCategory] = useState<Row>({ category_code: '', category_name: '' })
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [failed, setFailed] = useState(false)
  const notice = useCallback((text: string, isError: boolean) => { setMessage(text); setFailed(isError) }, [])

  const [revision, setRevision] = useState(0)
  const load = () => setRevision(value => value + 1)
  useEffect(() => {
    let alive = true
    Promise.all([getSeller(), getPartners(), getCategories()]).then(([sellerResult, partnerResult, categoryResult]) => {
      if (!alive) return
      setSeller(sellerResult.seller ?? {})
      setSellerSaved(Boolean(sellerResult.seller))
      setPartners(partnerResult.partners)
      setCarriers(partnerResult.carriers)
      setCategories(categoryResult.categories)
      setCategoryDrafts({})
    }).catch(error => { if (alive) notice(error instanceof Error ? error.message : '불러오지 못했습니다.', true) })
    return () => { alive = false }
  }, [revision, notice])

  const carrierOptions = useMemo(() => Object.fromEntries(carriers.map(row => [text(row.carrier_code), text(row.carrier_name)])), [carriers])
  const categoryName = (id: unknown) => text(categories.find(row => text(row.category_id) === text(id))?.category_name)

  const submitSeller = async () => {
    if (await runAction(setBusy, notice, () => saveSeller(seller))) load()
  }
  const submitPartner = async () => {
    if (!partner) return
    if (await runAction(setBusy, notice, () => savePartner(partner))) { setPartner(null); load() }
  }
  const categoryValue = (row: Row) => ({ ...row, ...categoryDrafts[text(row.category_id)] })
  const changeCategory = (row: Row, patch: Row) => setCategoryDrafts(current => ({ ...current, [text(row.category_id)]: { ...categoryValue(row), ...patch } }))
  const submitCategory = async (row: Row) => {
    if (await runAction(setBusy, notice, () => saveCategory(row))) load()
  }
  const addCategory = async () => {
    if (await runAction(setBusy, notice, () => saveCategory({ ...newCategory, sort_order: categories.length + 1 }), '카테고리를 추가했습니다.')) {
      setNewCategory({ category_code: '', category_name: '' })
      load()
    }
  }

  return <div className="dist-page"><SideMenuLayout header={<HeaderBar title="협력사·기본 설정" breadcrumbs={[{ label: '협력사 관리' }, { label: '협력사·기본 설정' }]} />}>
    <div className="rd rd-page dist-admin">
      <header className="rd-page__head">
        <div>
          <h1 className="rd-sr-only">협력사·기본 설정</h1>
          <p className="rd-muted">더채움 유통으로 파는 상품의 공급 협력사(완도 수산회사, 하츄핑 등)와 상품 카테고리를 관리합니다.
            상품을 등록하려면 <b>판매 주체(더채움 사업자 정보)</b>가 먼저 있어야 합니다.</p>
        </div>
      </header>
      <Notice message={message} failed={failed} />

      <section className="rd-card dist-card" aria-labelledby="dist-seller-title">
        <div className="dist-card__head">
          <h2 className="rd-h2" id="dist-seller-title">판매 주체</h2>
          {sellerSaved ? <span className="rd-chip is-ok">등록됨</span> : <span className="rd-chip is-warn">등록 필요</span>}
        </div>
        <p className="rd-muted rd-fs-sm">세금계산서·영수증을 발행하는 우리 법인 정보입니다. 주문서·명세서에 찍힙니다.</p>
        <form onSubmit={event => { event.preventDefault(); void submitSeller() }}>
          <Fields defs={SELLER_FIELDS} value={seller} disabled={busy} onChange={patch => setSeller(current => ({ ...current, ...patch }))} />
          <div className="dist-actions"><button type="submit" className="rd-btn is-primary" disabled={busy}>판매 주체 저장</button></div>
        </form>
      </section>

      <section className="rd-card dist-card" aria-labelledby="dist-partner-title">
        <div className="dist-card__head">
          <h2 className="rd-h2" id="dist-partner-title">협력사 {partners.length}곳</h2>
          <button type="button" className="rd-btn" disabled={busy} onClick={() => setPartner({ ...NEW_PARTNER })}>협력사 추가</button>
        </div>
        <div className="rd-page__scroll" tabIndex={0} role="region" aria-label="협력사 목록">
          <table className="rd-table dist-table">
            <thead><tr><th>코드</th><th>협력사</th><th>공급 방식</th><th>담당자</th><th>발주서</th><th className="is-num">상품(판매중)</th><th>사용</th><th aria-label="수정" /></tr></thead>
            <tbody>
              {partners.length === 0 ? <tr><td colSpan={8} className="dist-empty">등록된 협력사가 없습니다. '협력사 추가'를 눌러 시작하세요.</td></tr> : null}
              {partners.map(row => <tr key={text(row.partner_id)} className={row.active_yn === 'N' ? 'is-off' : ''}>
                <td className="dist-code">{text(row.partner_code)}</td>
                <td><b>{text(row.partner_name)}</b></td>
                <td>{PARTNER_TYPE_LABEL[text(row.partner_type)] ?? text(row.partner_type)}</td>
                <td>{text(row.manager_name)}{row.manager_phone ? <small className="rd-muted"> · {text(row.manager_phone)}</small> : null}</td>
                <td>{PO_METHOD_LABEL[text(row.po_send_method)] ?? text(row.po_send_method)}</td>
                <td className="is-num">{text(row.product_count)}({text(row.on_sale_count)})</td>
                <td>{row.active_yn === 'N' ? '사용 안 함' : '사용'}</td>
                <td><button type="button" className="rd-btn" disabled={busy} onClick={() => setPartner({ ...row, lead_time_days: text(row.lead_time_days) })}>수정</button></td>
              </tr>)}
            </tbody>
          </table>
        </div>
        {partner ? <form className="dist-editor" aria-label={partner.partner_id ? '협력사 수정' : '협력사 추가'} onSubmit={event => { event.preventDefault(); void submitPartner() }}>
          <h3 className="dist-editor__title">{partner.partner_id ? `${text(partner.partner_name)} 수정` : '새 협력사'}</h3>
          <Fields defs={partnerFields(carrierOptions)} value={partner} disabled={busy} onChange={patch => setPartner(current => ({ ...current, ...patch }))} />
          <label className="dist-check"><input type="checkbox" checked={partner.active_yn !== 'N'} disabled={busy}
            onChange={event => setPartner(current => ({ ...current, active_yn: event.target.checked ? 'Y' : 'N' }))} />사용(끄면 새 상품에 고를 수 없음)</label>
          <div className="dist-actions">
            <button type="button" className="rd-btn" disabled={busy} onClick={() => setPartner(null)}>취소</button>
            <button type="submit" className="rd-btn is-primary" disabled={busy}>{partner.partner_id ? '저장' : '추가'}</button>
          </div>
        </form> : null}
      </section>

      <section className="rd-card dist-card" aria-labelledby="dist-category-title">
        <div className="dist-card__head"><h2 className="rd-h2" id="dist-category-title">상품 카테고리 {categories.length}개</h2></div>
        <form className="dist-inline" onSubmit={event => { event.preventDefault(); void addCategory() }}>
          <input className="rd-input" aria-label="새 카테고리 코드" placeholder="코드(예: SEAFOOD)" maxLength={30} value={text(newCategory.category_code)} disabled={busy}
            onChange={event => setNewCategory(current => ({ ...current, category_code: event.target.value.toUpperCase() }))} />
          <input className="rd-input" aria-label="새 카테고리 이름" placeholder="이름(예: 수산)" maxLength={100} value={text(newCategory.category_name)} disabled={busy}
            onChange={event => setNewCategory(current => ({ ...current, category_name: event.target.value }))} />
          <button type="submit" className="rd-btn is-primary" disabled={busy || !text(newCategory.category_code).trim() || !text(newCategory.category_name).trim()}>추가</button>
        </form>
        <div className="rd-page__scroll" tabIndex={0} role="region" aria-label="카테고리 목록">
          <table className="rd-table dist-table">
            <thead><tr><th>순서</th><th>코드</th><th>이름</th><th>상위</th><th className="is-num">상품</th><th>사용</th><th aria-label="저장" /></tr></thead>
            <tbody>
              {categories.map(row => {
                const value = categoryValue(row)
                const dirty = ['category_name', 'sort_order', 'use_yn', 'parent_category_id'].some(key => text(value[key]) !== text(row[key]))
                return <tr key={text(row.category_id)} className={value.use_yn === 'N' ? 'is-off' : ''}>
                  <td><input className="rd-input dist-num" type="number" aria-label={`${text(row.category_name)} 순서`} value={text(value.sort_order)} disabled={busy}
                    onChange={event => changeCategory(row, { sort_order: event.target.value })} /></td>
                  <td className="dist-code">{text(row.category_code)}</td>
                  <td><input className="rd-input" aria-label={`${text(row.category_code)} 이름`} maxLength={100} value={text(value.category_name)} disabled={busy}
                    onChange={event => changeCategory(row, { category_name: event.target.value })} /></td>
                  <td><select className="rd-input" aria-label={`${text(row.category_name)} 상위 카테고리`} value={text(value.parent_category_id)} disabled={busy}
                    onChange={event => changeCategory(row, { parent_category_id: event.target.value })}>
                    <option value="">없음(대분류)</option>
                    {categories.filter(other => other.category_id !== row.category_id).map(other =>
                      <option key={text(other.category_id)} value={text(other.category_id)}>{text(other.category_name)}</option>)}
                  </select>{row.parent_category_id ? <small className="rd-muted"> {categoryName(row.parent_category_id)} 아래</small> : null}</td>
                  <td className="is-num">{text(row.product_count)}</td>
                  <td><label className="dist-check"><input type="checkbox" checked={value.use_yn !== 'N'} disabled={busy}
                    onChange={event => changeCategory(row, { use_yn: event.target.checked ? 'Y' : 'N' })} />사용</label></td>
                  <td><button type="button" className="rd-btn" disabled={busy || !dirty} onClick={() => void submitCategory(value)}>저장</button></td>
                </tr>
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  </SideMenuLayout></div>
}
