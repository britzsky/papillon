import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import TouchLayout from '../TouchLayout'
import TouchIcon, { type TouchIconName } from '../TouchIcon'
import { TASKS, accountHref, needsSite, taskCount, useDailyWork, type TaskTile } from '../../features/workspace/useDailyWork'
import HomeSearchTouch from './HomeSearchTouch'
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
  // 위 거래처 선택(TouchLayout)과 같은 기준. 비우면 본사는 모든 거래처를 본다
  const account = params.get('account_id') || localStorage.getItem('account_id') || ''
  const { data, error, rows, single, busy, tiles, refresh } = useDailyWork(account)
  const userName = localStorage.getItem('user_name') || ''

  const withAccount = (to: string) => account ? accountHref(to, account) : to
  const pickAccount = (accountId: string, name: string) => {
    localStorage.setItem('account_id', accountId)
    localStorage.setItem('account_name', name)
    navigate(accountHref('/home', accountId))
  }

  const toolbar = <button type="button" className="t-btn is-small" onClick={refresh}>새로고침</button>

  return <TouchLayout title={userName ? `${userName}님, 안녕하세요` : '오늘 할 일'} subtitle={single ? single.account_name : rows.length > 1 ? `거래처 ${rows.length}곳` : undefined} toolbar={toolbar}>
    <HomeSearchTouch />
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
          <button type="button" className="t-card ht-account" onClick={() => pickAccount(row.account_id, row.account_name)}>
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

    <h2 className="t-section-title">바로 가기</h2>
    <div className="ht-quick">
      {QUICK.map(item => <Link key={item.to} className="t-card ht-quick__item" to={withAccount(item.to)}>
        <span className="ht-quick__cover"><TouchIcon name={item.icon} size={34} /></span>
        <strong>{item.label}</strong>
        <small>{item.hint}</small>
        <span className="t-btn is-soft is-small is-block">열기</span>
      </Link>)}
    </div>
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
