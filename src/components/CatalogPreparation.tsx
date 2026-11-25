import { preparationLabel, useCatalogPreparation, type CatalogSupplier } from '../features/order/useCatalogPreparation'

/** 공급사 첫 글자(웰스토리 '웰', 아워홈 '아') */
const supplierLetter = (s: CatalogSupplier) => s.supplier_code === 'WELSTORY' ? '웰' : s.supplier_code === 'OURHOME' ? '아' : (s.supplier_name || s.supplier_code).trim().slice(0, 1)
const tone = (status: string) => status === 'READY' ? 'is-ready' : status === 'PREPARING' ? 'is-preparing' : 'is-failed'

/**
 * 납품일별 상품·가격 준비 상태(PC). 로직은 features/order/useCatalogPreparation(터치 발주하기와 공용).
 * 2026-11-25 사용자 요청: 공급사 이름·문구를 풀어 쓰지 않고 동그라미 하나씩 — 웰(웰스토리)·아(아워홈).
 * 바탕색 = 준비 중 주황 · 준비 완료 초록 · 실패(확인 필요) 빨강. 빨강엔 작은 ! — 마우스를 올리면(또는 포커스) 실패 이유.
 * inline: 다른 줄 안에 붙이는 모양(머리 글 '상품 준비' 없이). 아닐 때는 '상품 준비' 글과 함께 한 줄.
 */
export default function CatalogPreparation({ accountId, date, onReady, inline = false }: { accountId: string; date: string; onReady?: () => void; inline?: boolean }) {
  const { result, error, retry } = useCatalogPreparation(accountId, date, onReady)
  const needsRetry = Boolean(error) || Boolean(result?.suppliers.some(s => s.status !== 'READY'))
  return <span className={`catalog-prep${inline ? ' is-inline' : ''}`} role="status" aria-label="납품일 상품 준비">
    {!inline ? <span className="catalog-prep__title">상품 준비</span> : null}
    {!result && !error ? <span className="catalog-prep__dot is-preparing" title="확인 중"><span aria-hidden="true">…</span><span className="rd-sr-only">확인 중</span></span> : null}
    {result?.suppliers.length === 0 ? <span className="catalog-prep__empty">공급사 사업장 미지정</span> : null}
    {result?.suppliers.map(s => {
      const reason = [s.message, s.last_succeeded_at ? `마지막 성공 ${s.last_succeeded_at}` : ''].filter(Boolean).join(' · ')
      const label = `${s.supplier_name} ${preparationLabel(s.status)}`
      const failed = tone(s.status) === 'is-failed'
      return <span key={s.supplier_code} className={`catalog-prep__dot ${tone(s.status)} is-${s.supplier_code}`} tabIndex={failed ? 0 : undefined}
        aria-label={failed && reason ? `${label}: ${reason}` : label} title={failed ? undefined : label}>
        <span aria-hidden="true">{supplierLetter(s)}</span>
        {failed ? <span className="catalog-prep__bang" aria-hidden="true">!</span> : null}
        {failed ? <span className="catalog-prep__tip" role="tooltip">{label}{reason ? <><br />{reason}</> : <><br />이유를 받지 못했어요. 다시 확인을 눌러 보세요.</>}</span> : null}
      </span>
    })}
    {error ? <span className="catalog-prep__dot is-failed" tabIndex={0} aria-label={`상품 준비 확인 실패: ${error}`}><span aria-hidden="true">?</span><span className="catalog-prep__bang" aria-hidden="true">!</span><span className="catalog-prep__tip" role="tooltip">{error}</span></span> : null}
    {needsRetry ? <button type="button" className="catalog-prep__retry" onClick={retry} title="준비 상태 다시 확인" aria-label="준비 상태 다시 확인">↻</button> : null}
  </span>
}
