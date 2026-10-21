import HeaderBar from '../../components/HeaderBar'
import SideMenuLayout from '../../components/SideMenuLayout'
import DeadlineAlertSlot from '../../components/DeadlineAlertSlot'
import { AI_FEATURE_LABELS } from '../../api/aiUsage'
import { AI_USAGE_PERIODS, formatKrw, formatTokens, formatUsd, KRW_PER_USD, useAiUsage } from '../../features/operations/useAiUsage'
import './AiUsage.css'

/** AI 사용 이력(PC, 본사 전용): 기간·거래처 → 합계 칸 → 기능별 합계 → 호출 목록(토큰·예상 비용). 조회는 features/operations/useAiUsage(터치와 공용). */
function AiUsage() {
  const u = useAiUsage()
  const report = u.report
  const todayCost = report?.today_cost_usd ?? 0

  return <div className="ai-usage-page"><SideMenuLayout header={<HeaderBar title="AI 사용 이력" breadcrumbs={[{ label: '본사관리' }, { label: 'AI 사용 이력' }]} />}>
    <div className="rd rd-page rd-ai-usage">
      <header className="rd-page__head">
        <div>
          <h1 className="rd-sr-only">AI 사용 이력</h1>
          <p className="rd-muted">AI 호출마다 토큰 수와 예상 비용을 기록합니다. 실제 청구액은 OpenAI 사용량 화면이 기준입니다.</p>
        </div>
        <DeadlineAlertSlot />
        <div className="rd-page__actions">
          <select aria-label="거래처" value={u.accountId} onChange={event => u.setAccountId(event.target.value)}>
            <option value="">전체 거래처</option>
            {u.accounts.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
          <div className="rd-seg" role="group" aria-label="조회 기간">
            {AI_USAGE_PERIODS.map(([value, label]) => <button type="button" key={value} className={u.period === value ? 'is-active' : ''} onClick={() => u.setPeriod(value)}>{label}</button>)}
          </div>
        </div>
      </header>
      {u.error ? <p className="rd-alert">{u.error}</p> : null}
      <div className="rd-page__tiles">
        <div className="rd-card rd-page__tile"><span>예상 비용</span><strong>{formatUsd(u.totals.cost)}</strong><small>{formatKrw(u.totals.cost)} · {report ? `${report.from} ~ ${report.to}` : ''}</small></div>
        <div className="rd-card rd-page__tile is-info"><span>호출</span><strong>{formatTokens(u.totals.calls)}회</strong><small>처리 항목 {formatTokens(u.totals.items)}개{u.totals.failed ? ` · 실패 ${u.totals.failed}회` : ''}</small></div>
        <div className="rd-card rd-page__tile"><span>토큰</span><strong>{formatTokens(u.totals.input + u.totals.output)}</strong><small>입력 {formatTokens(u.totals.input)} · 출력 {formatTokens(u.totals.output)}(추론 {formatTokens(u.totals.reasoning)})</small></div>
        <div className={`rd-card rd-page__tile${u.dailyLimit > 0 && todayCost >= u.dailyLimit * 0.8 ? ' is-warn' : ' is-ok'}`}><span>오늘 사용</span><strong>{formatUsd(todayCost)}</strong><small>{u.dailyLimit > 0 ? `하루 한도 $${u.dailyLimit} (전체 거래처 합계)` : '하루 한도 없음'}</small></div>
      </div>

      <section className="rd-card rd-page__box">
        <div className="rd-page__list-head"><h2 className="rd-h2">기능별 합계</h2>
          {report ? <span className="rd-muted rd-fs-sm">적용 단가(100만 토큰당): 입력 ${report.price_per_1m.input} · 캐시 입력 ${report.price_per_1m.cached_input} · 출력 ${report.price_per_1m.output} · 원화는 1달러 {KRW_PER_USD.toLocaleString()}원 가정</span> : null}
        </div>
        <table className="rd-table"><thead><tr><th>기능</th><th className="is-num">호출</th><th className="is-num">항목</th><th className="is-num">입력 토큰</th><th className="is-num">출력 토큰</th><th className="is-num">추론 토큰</th><th className="is-num">예상 비용</th><th className="is-num">항목당</th></tr></thead>
          <tbody>{(report?.summary ?? []).map(item => <tr key={item.feature}>
            <td><strong>{AI_FEATURE_LABELS[item.feature] ?? item.feature}</strong>{item.failed_count ? <span className="rd-chip is-warn">실패 {item.failed_count}</span> : null}</td>
            <td className="is-num">{formatTokens(item.call_count)}</td><td className="is-num">{formatTokens(item.item_count)}</td>
            <td className="is-num">{formatTokens(item.input_tokens)}</td><td className="is-num">{formatTokens(item.output_tokens)}</td><td className="is-num">{formatTokens(item.reasoning_tokens)}</td>
            <td className="is-num">{formatUsd(item.cost_usd)}<small> {formatKrw(item.cost_usd)}</small></td>
            <td className="is-num">{item.item_count ? formatKrw(item.cost_usd / item.item_count) : '-'}</td>
          </tr>)}</tbody>
        </table>
        {!u.loading && report && report.summary.length === 0 ? <p className="rd-page__empty">이 기간에는 AI 호출이 없습니다.</p> : null}
      </section>

      <section className="rd-card rd-page__main">
        <div className="rd-page__list-head"><h2 className="rd-h2">호출 목록</h2><span className="rd-muted rd-fs-sm">최신 500건</span></div>
        <div className="rd-page__scroll" tabIndex={0} role="region" aria-label="AI 호출 목록">
          <table className="rd-table"><thead><tr><th>일시</th><th>기능</th><th>거래처</th><th>사용자</th><th>모델</th><th className="is-num">항목</th><th className="is-num">입력</th><th className="is-num">출력(추론)</th><th className="is-num">예상 비용</th><th className="is-num">시간</th><th>결과</th></tr></thead>
            <tbody>{(report?.rows ?? []).map(row => <tr key={row.ai_usage_log_id}>
              <td>{String(row.created_at).replace('T', ' ').slice(0, 16)}</td>
              <td>{AI_FEATURE_LABELS[row.feature] ?? row.feature}</td>
              <td>{row.account_name || row.account_id || '-'}</td>
              <td>{row.user_id || '-'}</td>
              <td className="rd-muted">{row.model}</td>
              <td className="is-num">{row.item_count}</td>
              <td className="is-num">{formatTokens(row.input_tokens)}{row.cached_input_tokens ? <small> (캐시 {formatTokens(row.cached_input_tokens)})</small> : null}</td>
              <td className="is-num">{formatTokens(row.output_tokens)} <small>({formatTokens(row.reasoning_tokens)})</small></td>
              <td className="is-num">{formatUsd(row.cost_usd)}</td>
              <td className="is-num">{row.duration_ms ? `${(row.duration_ms / 1000).toFixed(1)}초` : '-'}</td>
              <td>{row.status === 'SUCCESS' ? <span className="rd-chip is-ok">성공</span> : <span className="rd-chip is-warn" title={row.error_message ?? ''}>실패</span>}</td>
            </tr>)}</tbody>
          </table>
          {!u.loading && report && report.rows.length === 0 ? <p className="rd-page__empty">호출 기록이 없습니다.</p> : null}
        </div>
      </section>
    </div>
  </SideMenuLayout></div>
}
export default AiUsage
