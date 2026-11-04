import { parseInfo, safeDescription } from './productInfo'
import './ProductInfoView.css'

/** 더채움몰 상품 상세 아래쪽: 상세 설명 → 식품 표시사항 → 상품정보제공고시. 협력사 관리 '미리 보기'도 같은 화면 */
export default function ProductInfoView({ description, foodLabel, notice }: { description: unknown; foodLabel: unknown; notice: unknown }) {
  const html = safeDescription(description)
  const label = parseInfo(foodLabel)
  const notices = parseInfo(notice)
  if (!html && label.items.length === 0 && notices.items.length === 0) return null
  return <div className="dist-info">
    {html ? <section className="dist-info__section">
      <h3>상세 설명</h3>
      <div className="dist-info__html" dangerouslySetInnerHTML={{ __html: html }} />
    </section> : null}
    {label.items.length ? <InfoTable title="식품 표시사항" items={label.items} /> : null}
    {notices.items.length ? <InfoTable title={`상품정보제공고시${notices.type_name ? ` (${notices.type_name})` : ''}`} items={notices.items} /> : null}
  </div>
}

function InfoTable({ title, items }: { title: string; items: Array<{ label: string; value: string }> }) {
  return <section className="dist-info__section">
    <h3>{title}</h3>
    <table className="dist-info__table">
      <tbody>{items.map((item, index) => <tr key={index}><th scope="row">{item.label}</th><td>{item.value}</td></tr>)}</tbody>
    </table>
  </section>
}
