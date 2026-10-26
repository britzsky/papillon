import HeaderBar from '../../components/HeaderBar'
import SideMenuLayout from '../../components/SideMenuLayout'
import DeadlineAlertSlot from '../../components/DeadlineAlertSlot'
import { useHygieneBoard } from '../../features/sanitation/useHygieneBoard'
import HygieneBoard from './HygieneBoard'
import './VendorSanitation.css'

/** 위생 점검 관리(PC). 기록은 기존 ERP 위생관리(앱 위생점검과 같은 데이터) — 본문은 HygieneBoard(터치와 공용) */
function VendorSanitation() {
  const board = useHygieneBoard()
  return (
    <div className="vendor-sanitation-page">
      <main className="vendor-sanitation-content">
        <SideMenuLayout header={<HeaderBar title="위생 점검 관리" breadcrumbs={[{ label: 'Home', to: '/home' }, { label: '위생관리' }, { label: '위생 점검 관리' }]} />}>
          <div className="vs-page rd rd-page rd-vs">
            <header className="rd-page__head">
              <div>
                <h1 className="rd-sr-only">위생 점검 관리</h1>
                <p className="rd-muted">{board.accountName ? `${board.accountName} · ` : ''}부적합 사항과 조치 내용을 사진으로 남깁니다. 기존 위생점검 앱과 같은 기록입니다.</p>
              </div>
              <DeadlineAlertSlot />
            </header>
            <HygieneBoard board={board} />
          </div>
        </SideMenuLayout>
      </main>
    </div>
  )
}

export default VendorSanitation
