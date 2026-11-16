import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import HeroSlider, { BrandCurves } from '../components/HeroSlider'
import HomeProfileCard from '../components/HomeProfileCard'
import HomePhotoCards from '../components/HomePhotoCards'
import HomeShortcuts from '../components/HomeShortcuts'
import InstagramGrid from '../components/InstagramGrid'
import NoticeBoard from '../components/NoticeBoard'
import TopMenuLayout from '../components/TopMenuLayout'
import HomeSplash from '../components/HomeSplash'
import { HOME_READY_STEPS, HomeReadyContext, SPLASH_MAX_MS, clearSplashFlag, splashPending, type HomeReadyKey } from '../features/home/homeReady'
import { workspaceAccountId } from '../features/workspace/workspaceAccount'
import bannerImage from '../assets/image/3.png'
import { heroSlides, photoCards, pressArticles } from '../features/home/homeContent'
import './HomeMain.css'

/**
 * PC 홈(2026-11-09 사용자 시안 → 2026-11-10 새 시안, 사이드 메뉴 없음 · 상단 메뉴).
 * 판: 슬라이드(왼쪽) + 접속자 카드(HomeProfileCard: 인사·종 알림·이달 예산, 오른쪽) / 바로가기 아이콘 줄(HomeShortcuts) / 더채움 소식(NoticeBoard: 공지사항·홍보) + 인스타그램 4칸(C, 엇갈린 높이).
 * 판 아래: 사진 카드 3개(D) · 넓은 배너(E, 오른쪽 아래 로고 색 곡선). 종 알림·사용자 정보·로그아웃은 이 화면에서만 머리 줄 대신 접속자 카드에. 예전 홈(오늘 할 일)은 /home/sidebar.
 */
export default function Home() {
  const [params] = useSearchParams()
  const accountId = workspaceAccountId(params)
  useEffect(() => { document.title = '홈 · 더채움' }, [])

  // 로그인 직후에만 준비 화면(features/home/homeReady.ts): on → (다 끝나거나 최대 시간) leaving(사라지는 중) → off
  const [splash, setSplash] = useState<'on' | 'leaving' | 'off'>(() => splashPending() ? 'on' : 'off')
  const [ready, setReady] = useState<ReadonlySet<HomeReadyKey>>(() => new Set<HomeReadyKey>(['session']))
  const report = useCallback((key: HomeReadyKey) => setReady(prev => prev.has(key) ? prev : new Set(prev).add(key)), [])
  const allReady = HOME_READY_STEPS.every(step => ready.has(step.key))
  useEffect(() => {
    clearSplashFlag()
    const timer = window.setTimeout(() => setSplash(value => value === 'on' ? 'leaving' : value), SPLASH_MAX_MS)
    return () => window.clearTimeout(timer)
  }, [])
  useEffect(() => {
    if (!allReady || splash !== 'on') return
    // 마지막 체크가 보이게 잠깐 두고 사라짐
    const timer = window.setTimeout(() => setSplash('leaving'), 400)
    return () => window.clearTimeout(timer)
  }, [allReady, splash])
  useEffect(() => {
    if (splash !== 'leaving') return
    const timer = window.setTimeout(() => setSplash('off'), 380)
    return () => window.clearTimeout(timer)
  }, [splash])

  return (
    <HomeReadyContext.Provider value={report}>
    {splash !== 'off' ? <HomeSplash done={ready} leaving={splash === 'leaving'} /> : null}
    <TopMenuLayout actionsInPage>
      <div className="home-main">
        <section className="home-main__panel" aria-labelledby="home-main-title">
          <h1 id="home-main-title" className="rd-sr-only">더채움 홈</h1>

          <div className="home-main__hero-row">
            <HeroSlider className="home-main__hero" slides={heroSlides} />
            <HomeProfileCard key={accountId} accountId={accountId} className="home-main__account" />
          </div>

          <HomeShortcuts />

          <div className="home-main__lower">
            <NoticeBoard press={pressArticles} />
            <InstagramGrid />
          </div>
        </section>

        <HomePhotoCards photos={photoCards} />

        <figure className="home-main__banner">
          <img src={bannerImage} alt="" />
          <BrandCurves variant="banner" />
          <span className="home-main__slot-tag">E</span>
        </figure>
      </div>
    </TopMenuLayout>
    </HomeReadyContext.Provider>
  )
}
