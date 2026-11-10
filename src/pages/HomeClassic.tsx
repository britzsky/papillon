import DailyWork from '../components/DailyWork'
import HeaderBar from '../components/HeaderBar'
import SideMenuLayout from '../components/SideMenuLayout'
import HomeSearchBox from '../components/HomeSearchBox'
import './Home.css'

/* '자주 쓰는 화면'은 2026-10-29 본사도 빼면서 없앴다(현장은 10-22에 이미 뺌). 화면 입구는 '오늘 할 일'과 왼쪽 메뉴. */

/** 예전 PC 홈(사이드 메뉴 + 오늘 할 일). 2026-11-09 상단 메뉴 홈으로 바뀌면서 /home/sidebar에만 남김 — 새 홈 영역이 정해지면 정리 */
function HomeClassic() {
  return (
    <div className="home-page procurement-refresh">
      <main className="home-content">
        <SideMenuLayout header={<HeaderBar title="오늘의 운영" breadcrumbs={[{ label: '홈' }]} />}>
          <div className="home-dashboard rd rd-home">
            <DailyWork search={<HomeSearchBox />} />
          </div>
        </SideMenuLayout>
      </main>
    </div>
  )
}

export default HomeClassic
