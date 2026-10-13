import { preparationLabel, useCatalogPreparation } from '../features/order/useCatalogPreparation'

/**
 * 납품일별 상품·가격 준비 상태(PC). 로직은 features/order/useCatalogPreparation(터치 발주하기와 공용).
 * inline: 안내 문단 안에 한 줄로 넣는 짧은 표시(공급사별 준비 상태만, 자세한 사유는 마우스를 올리면 보임)
 */
export default function CatalogPreparation({ accountId, date, onReady, inline = false }: { accountId: string; date: string; onReady?: () => void; inline?: boolean }) {
  const { result, error, retry } = useCatalogPreparation(accountId, date, onReady)
  if (inline) {
    const label = preparationLabel
    return <span className="catalog-preparation-inline" role="status" aria-label="납품일 상품 준비">
      {!result && !error ? <b>확인 중</b> : null}
      {result?.suppliers.length === 0 ? <b className="is-warn">공급사 사업장 미지정</b> : null}
      {result?.suppliers.map((s, i) => <span key={s.supplier_code} title={[s.message, s.last_succeeded_at ? `마지막 성공 ${s.last_succeeded_at}` : ''].filter(Boolean).join(' · ')}>
        {i ? ', ' : ''}{s.supplier_name} <b className={s.status === 'READY' ? 'is-ok' : 'is-warn'}>{label(s.status)}</b></span>)}
      {error ? <b className="is-warn"> {error}</b> : null}
      {(error || result?.suppliers.some(s => s.status !== 'READY')) && <button type="button" className="catalog-preparation-inline__retry" onClick={retry}>다시 확인</button>}
    </span>
  }
  return <section aria-label="납품일 상품 준비" role="status">
    {!result && !error && <p>납품일별 상품·가격을 준비하고 있습니다.</p>}
    {result?.suppliers.length === 0 && <p>공급사 사업장을 먼저 지정해주세요.</p>}
    {result?.suppliers.map(s => <p key={s.supplier_code}>{s.supplier_name}: {s.status === 'READY' ? '준비 완료' : s.status === 'PREPARING' ? '준비 중' : '확인 필요'} · {s.message}{s.last_succeeded_at ? ` · 마지막 성공 ${s.last_succeeded_at}` : ''}</p>)}
    {error && <p role="alert">{error}</p>}
    {(error || result?.suppliers.some(s => s.status !== 'READY')) && <button type="button" onClick={retry}>준비 상태 다시 확인</button>}
  </section>
}
