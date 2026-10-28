import WeekMealBoard from '../../components/WeekMealBoard'
import { isSiteUser } from '../../features/workspace/roleScreens'
import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import TouchLayout from '../TouchLayout'
import TouchIcon, { type TouchIconName } from '../TouchIcon'
import { TASKS, accountHref, needsSite, taskCount, useDailyWork, type TaskTile } from '../../features/workspace/useDailyWork'
import HomeSearchTouch from './HomeSearchTouch'
import NextStepSheet, { type NextStep } from '../NextStepSheet'
import { useUpcomingMealDays } from '../../features/workspace/useWorkspaceCalendar'
import { isHeadquarters, rememberWorkspaceAccount, workspaceAccountId } from '../../features/workspace/workspaceAccount'
import './HomeTouch.css'

const TILE_ICON: Record<string, TouchIconName> = { prepare: 'order', pending_orders: 'alert', due_receipts: 'truck', pending_meals: 'meals' }

/** 자주 쓰는 일. 거래처 화면들은 account_id를 붙여 연다. */
const QUICK: { label: string; hint: string; to: string; icon: TouchIconName }[] = [
  { label: '식단 · 사용 확정', hint: '오늘 메뉴와 실제 식수', to: '/operations/table-meals', icon: 'meals' },
  { label: '발주하기', hint: '부족한 식재료 주문', to: '/order_manager/order', icon: 'order' },
  { label: '입고 확인', hint: '도착한 주문 입고 확정', to: '/order_manager/orders', icon: 'truck' },
  { label: '재고 현황', hint: '상품별 재고 · 직접 구매', to: '/inventory/account', icon: 'inventory' },
  { label: '위생 점검', hint: '거래처 위생 기록', to: '/sanitation/vendor', icon: 'sanitation' },
]

/**
 * 터치 홈: 통합 검색 + 오늘 할 일(큰 숫자 칸) + 자주 쓰는 일. 조회·계산은 PC 홈(DailyWork)과 같은 useDailyWork.
 * 거래처를 고르지 않은 본사 계정은 전체 합계와 일이 있는 거래처 목록을 본다.
 */
export default function HomeTouch() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  // 관리 거래처(PC와 같은 규칙). 본사가 비우면 모든 거래처를 본다
  const account = workspaceAccountId(params)
  const { data, error, rows, single, busy, tiles, refresh } = useDailyWork(account)
  const userName = localStorage.getItem('user_name') || ''

  const withAccount = (to: string) => account ? accountHref(to, account) : to
  const pickAccount = (accountId: string) => {
    rememberWorkspaceAccount(accountId)
    navigate(accountHref('/home', accountId))
  }
  const upcomingMealDays = useUpcomingMealDays(single?.account_id || '')
  const [sheet, setSheet] = useState<NextStep | null>(null)
  const next = single ? nextAction(single.account_id, needsSite(single), upcomingMealDays, tiles.find(tile => tile.key === 'prepare')) : null

  const toolbar = <button type="button" className="t-btn is-small" onClick={refresh}>새로고침</button>

  return <TouchLayout title={userName ? `${userName}님, 안녕하세요` : '오늘 할 일'} subtitle={single ? single.account_name : rows.length > 1 ? `거래처 ${rows.length}곳` : undefined} toolbar={toolbar}>
    {/* 큰 버튼 하나가 다음 할 일(새 주: 식단 → 발주서 → 발주 3번, 식단 있음: 발주서 → 발주 2번) */}
    {next && <section className={`ht-next${next.tone ? ` is-${next.tone}` : ''}`} aria-label="다음 할 일">
      <div className="ht-next__text"><small>{next.eyebrow}</small><strong>{next.title}</strong>{next.hint && <small>{next.hint}</small>}</div>
      {next.step ? <button type="button" className="t-btn is-large" onClick={() => setSheet(next.step!)}>{next.action}</button>
        : next.to ? <Link className="t-btn is-large" to={next.to}>{next.action}</Link> : null}
    </section>}
    {sheet && single && <NextStepSheet accountId={single.account_id} step={sheet} onClose={() => { setSheet(null); refresh() }} />}
    <HomeSearchTouch />
    {/* 현장 계정(2026-10-22): 이번 주 식단표를 크게 */}
    {single && isSiteUser() && <div className="rd ht-week"><WeekMealBoard accountId={single.account_id} editHref={accountHref('/operations/table-meals', single.account_id)} /></div>}
    <h2 className="t-section-title">
      오늘 할 일
      {data?.checked_at && <small className="ht-checked">{data.checked_at.slice(11, 16)} 기준</small>}
    </h2>
    {error && <p className="t-msg is-error" role="alert">{error}</p>}
    {!data && !error && <p className="t-msg" role="status">업무 현황을 확인하고 있습니다.</p>}
    {data && !rows.length && <p className="t-msg">조회할 거래처가 없습니다. 거래처 설정을 확인해주세요.</p>}

    {tiles.length > 0 && <div className="ht-tiles">{tiles.map(tile => <Tile key={tile.key} tile={tile} />)}</div>}

    {!single && busy.length > 0 && <>
      <h2 className="t-section-title">확인할 일이 있는 거래처 {busy.length}곳</h2>
      <ul className="ht-accounts">
        {busy.map(row => <li key={row.account_id}>
          <button type="button" className="t-card ht-account" onClick={() => pickAccount(row.account_id)}>
            <span className="t-dot">{row.account_name.slice(0, 1)}</span>
            <strong>{row.account_name}</strong>
            <span className="ht-account__chips">
              {needsSite(row) && <span className="t-badge is-warn">사업장 지정 필요</span>}
              {TASKS.filter(task => taskCount(row, task.key) > 0).map(task =>
                <span key={task.key} className={`t-badge ${task.tone === 'warn' ? 'is-warn' : 'is-info'}`}>{task.label} {taskCount(row, task.key)}</span>)}
            </span>
            <TouchIcon name="chevronRight" />
          </button>
        </li>)}
      </ul>
    </>}
    {!single && rows.length > 0 && !busy.length && <p className="t-msg">모든 거래처에 지금 확인할 업무가 없습니다.</p>}

    {!isSiteUser() && <><h2 className="t-section-title">바로 가기</h2>
    <div className="ht-quick">
      {QUICK.map(item => <Link key={item.to} className="t-card ht-quick__item" to={withAccount(item.to)}>
        <span className="ht-quick__cover"><TouchIcon name={item.icon} size={34} /></span>
        <strong>{item.label}</strong>
        <small>{item.hint}</small>
        <span className="t-btn is-soft is-small is-block">열기</span>
      </Link>)}
    </div></>}
  </TouchLayout>
}

function Tile({ tile }: { tile: TaskTile }) {
  const body = <>
    <span className="ht-tile__icon"><TouchIcon name={TILE_ICON[tile.key] || 'alert'} /></span>
    <span className="ht-tile__label">{tile.label}</span>
    <strong className="ht-tile__value">{tile.value}</strong>
    <span className="ht-tile__hint">{tile.hint}</span>
  </>
  const className = `t-card ht-tile is-${tile.tone}`
  return tile.to ? <Link className={className} to={tile.to}>{body}</Link> : <div className={className}>{body}</div>
}

type NextAction = { eyebrow: string; title: string; hint?: string; action: string; step?: NextStep; to?: string; tone?: 'quiet' | 'warn' }

/** 홈 맨 위 큰 버튼: 사업장 지정 → 다음 7일 식단 → 급한 발주(마감·재고 부족) → 식단 기준 발주 순서로 지금 할 일 하나 */
function nextAction(accountId: string, siteMissing: boolean, upcomingMealDays: number | null, prepare?: TaskTile): NextAction | null {
  if (siteMissing) return { eyebrow: '발주 준비', title: '공급사 사업장이 지정되지 않았어요', hint: isHeadquarters() ? '사업장을 지정하면 상품·판가를 받아 발주할 수 있어요' : '본사에 공급사 사업장 지정을 요청하세요', tone: 'warn',
    action: '사업장 지정', to: isHeadquarters() ? accountHref('/order_manager/supplier-sites', accountId) : undefined }
  if (upcomingMealDays === null) return null
  if (upcomingMealDays === 0) return { eyebrow: '다음 7일 식단표가 없어요', title: '다음 주 식단 만들기', hint: '템플릿 식단표 또는 식단표 파일을 불러와 저장하면 모자란 재료로 발주해요',
    action: '식단표로 가기', to: accountHref('/operations/table-meals', accountId) }
  if (prepare?.to && prepare.tone !== 'done') {
    const query = new URLSearchParams(prepare.to.split('?')[1] || '')
    const override: Record<string, string> = { account_id: accountId, autoselect: '1' }
    query.forEach((value, key) => { if (key !== 'tab') override[key] = value })
    if (query.get('tab') === 'stock') override.source = 'STOCK'
    return { eyebrow: prepare.label, title: `발주서 보기 · ${prepare.value}`, hint: prepare.hint, action: '발주서 보기', step: { kind: 'order', override, title: prepare.label } }
  }
  return { eyebrow: '급한 발주 없음', title: '식단 기준으로 발주서 보기', hint: '저장된 식단에서 모자란 재료만 골라 발주서를 만들어요', tone: 'quiet',
    action: '발주서 보기', step: { kind: 'order', override: { account_id: accountId, source: 'PLAN', autoselect: '1' }, title: '식단 기준 발주서' } }
}
