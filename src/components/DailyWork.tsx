import WorkspaceNotifications from './WorkspaceNotifications'
import { Fragment, useState, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { TASKS, accountHref as href, needsSite, taskCount as count, useDailyWork, type TaskTile, type TaskTone } from '../features/workspace/useDailyWork'
import { useUpcomingMealDays, useWorkspaceCalendar } from '../features/workspace/useWorkspaceCalendar'
import { useAccountSummary } from '../features/workspace/useAccountSummary'

const won = (value: number) => Math.round(value).toLocaleString('ko-KR')
/** 예산 묶음 하나(예산·사용·여유 + 사용 막대) */
function budgetBlock(title: string, budget = 0, used = 0, remaining = 0) {
  const pct = budget ? Math.round(used / budget * 100) : 0
  // 한 줄 제목(사용률) + 막대 + 예산|사용|여유 가로 3칸 — 홈이 스크롤 없이 한 화면에 들어가게(사용자 요청)
  return <div className="rd-budget">
    <div className="rd-budget__head"><strong className="rd-budget__title">{title}</strong>{budget ? <span className="rd-muted rd-fs-xs">{pct}% 사용</span> : null}</div>
    {budget ? <span className="rd-bar rd-account__bar" aria-hidden="true"><span className={used > budget ? 'is-over' : ''} style={{ width: `${Math.min(100, pct)}%` }} /></span> : null}
    <dl className="rd-budget__nums">
      <div><dt>예산</dt><dd>{won(budget)}원</dd></div>
      <div><dt>사용</dt><dd>{won(used)}원</dd></div>
      <div><dt>여유</dt><dd className={remaining < 0 ? 'rd-text-red' : 'rd-text-ok'}>{won(remaining)}원</dd></div>
    </dl>
  </div>
}

/**
 * PC 홈 본문(2026-10-15 개편, 시안 ① 홈). 조회·계산은 features/workspace/useDailyWork(터치 홈과 공용).
 * 거래처 한 곳(현장 계정·본사가 거래처 선택): 머리 줄 → 칸 4개 → '오늘 순서대로' 목록 + 달력.
 * 여러 거래처(본사): 머리 줄 → 합계 칸 → 거래처 표.
 */
const CHIP: Record<TaskTone, string> = { urgent: '마감 임박', warn: '확인 요망', info: '오늘', done: '여유' }
type Step = { key: string; title: string; detail: string; action: string; to: string }

export default function DailyWork({ search, shortcuts }: { search: ReactNode; shortcuts?: ReactNode }) {
  const [params] = useSearchParams()
  const account = params.get('account_id') || (localStorage.getItem('user_type') === '3' ? localStorage.getItem('account_id') || '' : '')
  const { data, error, rows, single, busy, idle, tiles, refresh } = useDailyWork(account)
  const [noticeAccount, setNoticeAccount] = useState('')
  const calendar = useWorkspaceCalendar(single?.account_id || '')
  const upcomingMealDays = useUpcomingMealDays(single?.account_id || '')
  const summary = useAccountSummary(single?.account_id || '')
  const userName = summary?.user_name || localStorage.getItem('user_name') || ''

  // 거래처 한 곳: 두 번째 칸은 '공급사 확인 요망'(접수 불명확 발주서 + 아워홈 출고·삭제 알림)
  const notices = single ? Number(single.supplier_notices) || 0 : 0
  const pending = single ? count(single, 'pending_orders') : 0
  const view: TaskTile[] = !single ? tiles : tiles.map(tile => tile.key !== 'pending_orders' ? tile : {
    ...tile, label: '공급사 확인 요망', value: `${pending + notices}건`,
    hint: pending + notices ? [pending && `접수 불명확 ${pending}`, notices && `출고·삭제 알림 ${notices}`].filter(Boolean).join(' · ') : '공급사 쪽 확인할 것 없음',
    tone: pending + notices ? 'urgent' : 'done', to: pending + notices ? href('/order_manager/orders', single.account_id) : undefined,
  })
  const chip = (tile: TaskTile) => tile.key === 'prepare' && tile.tone === 'warn' ? '발주 필요' : tile.key === 'due_receipts' && tile.tone !== 'done' ? '입고' : CHIP[tile.tone]

  // '오늘 순서대로' — 할 일이 있는 칸만, 식단표 → 발주 → 공급사 확인 → 입고 → 사용 확정 순서
  const steps: Step[] = single ? [
    // 업무 순서 ①: 다음 7일 식단이 없으면 식단표부터(식단이 있어야 필요한 재료로 바로 발주된다)
    ...(upcomingMealDays === 0 && !(view.find(tile => tile.key === 'prepare')?.value === '사업장 지정') ? [{
      key: 'meal', title: '다음 7일 식단표가 없어요', detail: '식단표를 만들고 저장하면 모자란 재료가 바로 발주 화면에 담겨요',
      action: '식단표 만들기', to: href('/operations/table-meals', single.account_id),
    }] : []),
    ...view.filter(tile => tile.tone !== 'done' && tile.to).map(tile => ({
    key: tile.key,
    title: tile.key === 'prepare' ? `${tile.label.replace('발주 준비 · ', '')} — ${tile.value}` : `${tile.label} ${tile.value}`,
    detail: tile.hint,
    action: tile.key === 'prepare' ? (tile.value === '사업장 지정' ? '사업장 지정' : '발주하기') : tile.key === 'pending_orders' ? '확인' : tile.key === 'due_receipts' ? '입고 확인' : '사용 확정',
    to: tile.to as string,
  }))] : []
  const title = single ? (steps.length ? `오늘 할 일 ${steps.length}가지가 있어요` : '오늘 할 일을 모두 마쳤어요')
    : rows.length > 1 ? `거래처 ${rows.length}곳 · 확인할 곳 ${busy.length}곳` : '오늘 할 일'
  const today = new Date().toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'long' })

  const tileView = (tile: TaskTile) => {
    const body = <><span className={`rd-chip is-${tile.tone}`}>{chip(tile)}</span><span className="rd-tile__label">{tile.label}</span>
      <strong className="rd-tile__value">{tile.value}</strong><span className="rd-tile__hint">{tile.hint}</span></>
    const className = `rd-tile is-${tile.tone}`
    return tile.to ? <Link key={tile.key} className={className} to={tile.to}>{body}</Link> : <div key={tile.key} className={className}>{body}</div>
  }

  return <>
    <header className="rd-home__head">
      <div>
        <div className="rd-muted">{today}{data?.checked_at ? ` · ${data.checked_at.slice(11, 16)} 기준` : ''}{single ? ` · ${single.account_name}` : ''}</div>
        <h1 className="rd-h1">{title}</h1>
      </div>
      {search}
    </header>

    {error && <p role="alert">{error}</p>}
    {!data && !error && <p role="status" className="rd-muted">업무 현황을 확인하고 있습니다.</p>}
    {data && !rows.length && <p>조회할 거래처가 없습니다. 거래처 설정을 확인해주세요.</p>}

    {!single && rows.length > 0 && <section className="rd-tiles" aria-label="오늘 현황">{view.map(tileView)}</section>}

    {/* 거래처 한 곳: 왼쪽 = 칸 4개 + 순서 목록, 오른쪽 = 거래처 카드(담당자·예산) + 달력 */}
    {single && <div className="rd-home__grid">
      <div className="rd-home__main">
      <section className="rd-tiles" aria-label="오늘 현황">{view.map(tileView)}</section>
      <section className="rd-card rd-steps" aria-label="오늘 할 일 순서">
        {/* 제목 줄: 업무 알림 버튼도 여기(목록 아래 한 줄 절약). 펼치면 알림 패널은 제목 아래 한 줄 전체 */}
        <div className="rd-steps__head">
          <h2 className="rd-h2">오늘 순서대로 하면 돼요</h2>
          <button type="button" className="rd-btn is-ghost" onClick={refresh}>새로고침</button>
          <div className="rd-steps__notice"><WorkspaceNotifications accountId={single.account_id} /></div>
        </div>
        <p className="rd-muted">식단표 → 발주 → 공급사 확인 → 입고 → 사용 확정. 끝나면 자동으로 지워집니다.</p>
        {steps.length ? <ol>{steps.map((step, index) => <li key={step.key} className={`rd-step${index === 0 ? ' is-first' : ''}`}>
          <span className={`rd-step__no${index === 0 ? '' : ` rd-tone-${view.find(t => t.key === step.key)?.tone || 'done'}`}`}>{index + 1}</span>
          <span className="rd-step__text"><strong>{step.title}</strong><span>{step.detail}</span></span>
          <Link className="rd-btn" to={step.to}>{step.action}</Link>
        </li>)}</ol> : <div className="rd-steps__done">지금 할 일이 없어요. 새 일이 생기면 여기에 순서대로 나타납니다.</div>}
      </section>
      {shortcuts}
      </div>

      <aside className="rd-home__side" aria-label="거래처 정보와 달력">
      <section className="rd-card rd-account" aria-label="거래처 정보">
        {/* 거래처명 왼쪽 · 로그인한 사람 이름 오른쪽(서버 값, 없으면 로그인 때 저장한 이름 — 사이드 메뉴 카드와 같은 값) */}
        <div className="rd-account__who">
          <strong className="rd-fs-lg">{summary?.account_name || single.account_name}</strong>
          {userName ? <span className="rd-account__user">{userName} 님</span> : null}
        </div>
        <dl className="rd-account__rows">
          <div><dt>담당자</dt><dd>{summary?.manager_name ? `${summary.manager_name}${summary.manager_tel ? ` · ${summary.manager_tel}` : ''}` : '등록 안 됨'}</dd></div>
        </dl>
        {/* 예산: 기존 ERP 예산관리 값 그대로(식자재 budget_grant/day_use_amount, 소모품 supplies_budget/supplies_used) */}
        {!summary ? <p className="rd-muted rd-fs-sm">예산을 확인하고 있어요.</p>
          : summary.budget.status === 'ERROR' ? <p className="rd-text-warn rd-fs-sm">ERP 예산을 불러오지 못했어요. 잠시 후 새로고침해 주세요.</p>
          : summary.budget.status === 'NONE' ? <p className="rd-muted rd-fs-sm">{Number(summary.month.slice(5))}월 예산이 아직 등록되지 않았어요.</p>
          : <>{budgetBlock('식자재 예산', summary.budget.food_budget, summary.budget.food_used, summary.budget.food_remaining)}
            {budgetBlock('소모품 예산', summary.budget.supplies_budget, summary.budget.supplies_used, summary.budget.supplies_remaining)}
            <small className="rd-muted rd-fs-xs">{Number(summary.month.slice(5))}월 · ERP 예산관리 기준{summary.budget.note ? ` · ${summary.budget.note}` : ''}</small></>}
      </section>

      <section className="rd-card rd-cal" aria-label="발주·입고 달력">
        <div className="rd-cal__head">
          <h2 className="rd-h2">{calendar.title}</h2>
          <div className="rd-cal__nav">
            <button type="button" className="rd-icon-btn" aria-label="이전 달" onClick={() => calendar.move(-1)}>‹</button>
            <button type="button" className="rd-icon-btn" aria-label="다음 달" onClick={() => calendar.move(1)}>›</button>
          </div>
        </div>
        <div className="rd-cal__week" aria-hidden="true">{'일월화수목금토'.split('').map(d => <span key={d}>{d}</span>)}</div>
        <div className="rd-cal__days">{calendar.cells.map((cell, index) => cell.blank
          ? <span key={`b${index}`} className="rd-cal__day is-blank" aria-hidden="true" />
          : <span key={cell.date} title={cell.title || undefined} aria-label={`${cell.label}일${cell.title ? ` ${cell.title}` : ''}`}
            className={`rd-cal__day${cell.today ? ' is-today' : cell.state === 'need' ? ' is-need' : ''}`}>
            <span>{cell.label}</span><span className={`rd-cal__dot is-${cell.state}`} />
          </span>)}</div>
        <div className="rd-cal__legend">
          <span><span className="rd-cal__dot is-received" />입고 완료</span>
          <span><span className="rd-cal__dot is-ordered" />발주 진행</span>
          <span><span className="rd-cal__dot is-need" />발주 필요</span>
          <span><span className="rd-cal__dot is-meal" />식단만 있음</span>
        </div>
      </section>
      </aside>
    </div>}

    {!single && busy.length > 0 && <section className="rd-card rd-hq-table" aria-label="거래처별 할 일"><table>
      <thead><tr><th>거래처</th>{TASKS.map(task => <th key={task.key}>{task.label}</th>)}<th>공급사 사업장</th><th>발주</th><th>업무 알림</th></tr></thead>
      <tbody>{busy.map(row => <Fragment key={row.account_id}>
        <tr>
          <td><strong>{row.account_name}</strong></td>
          {TASKS.map(task => <td key={task.key}>{count(row, task.key)
            ? <Link className={`rd-num rd-tone-${task.tone}`} to={href(task.path, row.account_id)}>{count(row, task.key)}건</Link>
            : <span className="rd-zero">-</span>}</td>)}
          <td>{needsSite(row) ? <Link className="rd-num rd-tone-warn" to={href('/order_manager/supplier-sites', row.account_id)}>지정 필요</Link> : <span className="rd-zero">{Number(row.mapped_suppliers)}곳</span>}</td>
          <td><Link className="rd-btn" to={href('/order_manager/recommended', row.account_id)}>발주안</Link></td>
          <td><button type="button" className="rd-btn" aria-expanded={noticeAccount === row.account_id} onClick={() => setNoticeAccount(current => current === row.account_id ? '' : row.account_id)}>{noticeAccount === row.account_id ? '접기' : '보기'}</button></td>
        </tr>
        {noticeAccount === row.account_id && <tr><td colSpan={TASKS.length + 4}><WorkspaceNotifications accountId={row.account_id} defaultOpen /></td></tr>}
      </Fragment>)}</tbody>
    </table></section>}
    {!single && rows.length > 0 && !busy.length && <p className="rd-steps__done">모든 거래처에 지금 확인할 업무가 없습니다.</p>}
    {!single && idle.length > 0 && <details>
      <summary>업무 없는 거래처 {idle.length}곳</summary>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>{idle.map(row => <Link key={row.account_id} className="rd-btn" to={href('/order_manager/recommended', row.account_id)}>{row.account_name}</Link>)}</div>
    </details>}
    {!single && shortcuts}
  </>
}
