import WorkspaceNotifications from './WorkspaceNotifications'
import { Fragment, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { TASKS, accountHref as href, needsSite, taskCount as count, useDailyWork, type TaskTile } from '../features/workspace/useDailyWork'
import './DailyWork.css'

/** 오늘 할 일 칸(PC 홈). 조회·계산은 features/workspace/useDailyWork(터치 홈과 공용). 같은 화면으로 가는 입구는 홈에서 이 칸과 '자주 쓰는 화면' 두 곳뿐이다. */
export default function DailyWork() {
  const [params] = useSearchParams()
  const account = params.get('account_id') || (localStorage.getItem('user_type') === '3' ? localStorage.getItem('account_id') || '' : '')
  const { data, error, rows, single, busy, idle, tiles, refresh } = useDailyWork(account)
  const [noticeAccount, setNoticeAccount] = useState('')

  const tile = ({ key, label, value, hint, tone, to }: TaskTile) => {
    const body = <><span className="home-tasks__label">{label}</span><strong className="home-tasks__count">{value}</strong><span className="home-tasks__hint">{hint}</span></>
    const className = `home-tasks__tile is-${tone}`
    return to ? <Link key={key} className={className} to={to}>{body}</Link> : <div key={key} className={className}>{body}</div>
  }

  return <section className="home-tasks" aria-label="오늘 할 일">
    <div className="home-tasks__heading">
      <h2>오늘 할 일{single ? <span> · {single.account_name}</span> : rows.length > 1 ? <span> · 거래처 {rows.length}곳</span> : null}</h2>
      {data?.checked_at && <small>{data.checked_at.slice(11, 16)} 기준</small>}
      <button type="button" onClick={refresh}>새로고침</button>
    </div>
    {error && <p role="alert">{error}</p>}
    {!data && !error && <p role="status">업무 현황을 확인하고 있습니다.</p>}
    {data && !rows.length && <p>조회할 거래처가 없습니다. 거래처 설정을 확인해주세요.</p>}

    {rows.length > 0 && <div className="home-tasks__tiles">{tiles.map(tile)}</div>}

    {single && <WorkspaceNotifications accountId={single.account_id} />}

    {!single && busy.length > 0 && <div className="home-tasks__table workspace-table-scroll"><table>
      <thead><tr><th>거래처</th>{TASKS.map(task => <th key={task.key}>{task.label}</th>)}<th>공급사 사업장</th><th>발주</th><th>업무 알림</th></tr></thead>
      <tbody>{busy.map(row => <Fragment key={row.account_id}>
        <tr>
          <td><strong>{row.account_name}</strong></td>
          {TASKS.map(task => <td key={task.key}>{count(row, task.key)
            ? <Link className={`home-tasks__num is-${task.tone}`} to={href(task.path, row.account_id)}>{count(row, task.key)}건</Link>
            : <span className="home-tasks__zero">-</span>}</td>)}
          <td>{needsSite(row) ? <Link className="home-tasks__num is-warn" to={href('/order_manager/supplier-sites', row.account_id)}>지정 필요</Link> : <span className="home-tasks__zero">{Number(row.mapped_suppliers)}곳</span>}</td>
          <td><Link className="home-tasks__go" to={href('/order_manager/recommended', row.account_id)}>발주안</Link></td>
          <td><button type="button" aria-expanded={noticeAccount === row.account_id} onClick={() => setNoticeAccount(current => current === row.account_id ? '' : row.account_id)}>{noticeAccount === row.account_id ? '접기' : '보기'}</button></td>
        </tr>
        {noticeAccount === row.account_id && <tr className="home-tasks__notice-row"><td colSpan={TASKS.length + 4}><WorkspaceNotifications accountId={row.account_id} defaultOpen /></td></tr>}
      </Fragment>)}</tbody>
    </table></div>}
    {!single && rows.length > 0 && !busy.length && <p className="home-tasks__all-clear">모든 거래처에 지금 확인할 업무가 없습니다.</p>}
    {!single && idle.length > 0 && <details className="home-tasks__idle">
      <summary>업무 없는 거래처 {idle.length}곳</summary>
      <div>{idle.map(row => <Link key={row.account_id} className="home-tasks__go" to={href('/order_manager/recommended', row.account_id)}>{row.account_name}</Link>)}</div>
    </details>}
  </section>
}
