import { useEffect } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import HeroSlider, { BrandCurves, type HeroSlide } from '../components/HeroSlider'
import HomeProfileCard from '../components/HomeProfileCard'
import HomePhotoCards, { type HomePhoto } from '../components/HomePhotoCards'
import HomeShortcuts from '../components/HomeShortcuts'
import InstagramGrid from '../components/InstagramGrid'
import NoticeBoard from '../components/NoticeBoard'
import PressSlide, { type PressArticle } from '../components/PressSlide'
import TopMenuLayout from '../components/TopMenuLayout'
import { workspaceAccountId } from '../features/workspace/workspaceAccount'
import bannerImage from '../assets/image/3.png'
import lunchboxImage from '../assets/image/home-d1-lunchbox.jpg'
import novemberMenuImage from '../assets/image/home-d2-november-menu.jpg'
import esportsImage from '../assets/image/home-d3-esports.jpg'
import './HomeMain.css'

/**
 * D-1~D-3 사진(2026-11-10 사용자 제공, 원본 3000×4000 등 → 긴 변 1400px 이하 JPG로 줄여 assets/image/home-d*.jpg).
 * 세로 사진을 가로 카드에 채우므로 position으로 보일 부분을 고른다(포스터는 제목 쪽). 누르면 원래 비율로 크게 보기(HomePhotoCards).
 */
const photoCards: HomePhoto[] = [
  { key: 'd1', src: lunchboxImage, alt: '더채움 도시락 — 소시지·떡갈비·달걀말이와 반찬', position: 'center 42%' },
  { key: 'd2', src: novemberMenuImage, alt: '11월 테마특식 배추한돈불고기찜 — 달큰한 배추에 한돈의 풍미를 더하다', position: 'center 18%' },
  { key: 'd3', src: esportsImage, alt: '제2회 구로 뇌병변장애인 e스포츠대회 — 도전은 ON! 한계는 OFF! 샌드아트', position: 'center 48%' },
]

/** 언론 보도 기사(2026-11-09 사용자 지정, 최신순). 슬라이드 한 장씩 + 더채움 소식 '홍보' 탭. 제목·날짜는 기사 원문 그대로(headline·sub는 슬라이드 큰 글씨, 2026-11-10 시안 문구) */
const pressArticles: PressArticle[] = [
  {
    url: 'https://www.koreadisablednews.com/news/articleView.html?idxno=55073',
    title: '구로뇌병변장애인비전센터, 제2회 뇌병변장애인 e스포츠대회 개최',
    outlet: '한국장애인신문', date: '2026-11-09',
    headline: '더채움과 함께하는\n도전은 ON 한계는 OFF', sub: '게임보조기기 활용\n뇌병변 E-스포츠 대회',
    image: 'https://cdn.koreadisablednews.com/news/photo/202611/55073_55368_030.png',
  },
  {
    url: 'https://www.ksilbo.co.kr/news/articleView.html?idxno=1070837',
    title: '리본엔터테인먼트 인천점, 노인요양시설한결·더채움 임직원 체육대회 성료',
    outlet: '경상일보', date: '2026-10-28',
    image: 'https://cdn.ksilbo.co.kr/news/photo/202610/1070837_648892_1047.jpg',
  },
  {
    url: 'https://www.finomy.com/news/articleView.html?idxno=253123',
    title: "'신영일의 비즈정보 플러스', '더채움' 위탁급식 혁신 전략 방영",
    outlet: '현대경제신문', date: '2026-04-14',
    image: 'https://cdn.finomy.com/news/photo/202604/253123_247684_4252.png',
  },
  {
    url: 'https://www.kdpress.co.kr/news/articleView.html?idxno=111200',
    title: '위탁급식업체 더채움, 세스코와 ‘요양원 조리시설 환경위생’ MOU 체결',
    outlet: '데일리경제', date: '2022-03-10',
    image: 'https://cdn.kdpress.co.kr/news/photo/202203/111200_99839_3753.jpg',
  },
]

/**
 * 큰 이미지 자리 슬라이드(2026-11-09 사용자 요청). 장을 늘리려면 이 배열에 추가(최대 MAX_SLIDES장).
 * 순서(2026-11-10 사용자 요청): 더채움몰 홍보(이미지 없이 HTML, 누르면 /mall)가 첫 장 → 언론 기사 최신순(e스포츠 대회부터). 처음 있던 회사 유니폼 사진(1.png) 장은 2026-11-10 사용자 요청으로 뺌.
 * 더채움몰 문구는 몰에 실제 있는 표시(특가·산지 직송·냉장/냉동)만 쓴다. 기사는 누르면 원문 새 창.
 */
const pressSlides: HeroSlide[] = pressArticles.map(article => ({ key: article.url, label: `언론 보도: ${article.title}`, content: <PressSlide article={article} /> }))

const heroSlides: HeroSlide[] = [
  {
    key: 'mall', label: '더채움몰 바로가기', curves: false,
    content: <Link to="/mall" className="hero-mall" aria-label="더채움몰 가기 — 산지 직송 신선 식자재 기획전">
      <span className="hero-mall__copy">
        <span className="hero-mall__logo" aria-hidden="true">더채움<b>몰</b></span>
        <strong className="hero-mall__title">신선한 식자재,<br />더채움몰에서 바로 주문하세요</strong>
        <span className="hero-mall__sub">협력사 산지 직송 상품과 더채움 상품을 한곳에서 — 발주 프로그램 계정 그대로 이용</span>
        <span className="hero-mall__chips" aria-hidden="true"><span>오늘의 특가</span><span>산지 직송</span><span>냉장·냉동 배송</span></span>
        <span className="hero-mall__go" aria-hidden="true">채움몰 가기 →</span>
      </span>
      <span className="hero-mall__art" aria-hidden="true">
        <svg className="hero-mall__basket" viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M8 26h48l-5 26a4 4 0 0 1-4 3H17a4 4 0 0 1-4-3z" fill="rgba(255,255,255,.14)" />
          <path d="M20 26l8-14M44 26l-8-14" /><path d="M24 34v13M32 34v13M40 34v13" />
          <circle cx="22" cy="17" r="5" fill="rgba(255,255,255,.3)" /><path d="M40 13c3-5 9-5 11-2-3 1-6 4-6 8" />
        </svg>
        <span className="hero-mall__tag is-1">오늘의 특가</span>
        <span className="hero-mall__tag is-2">산지 직송</span>
      </span>
    </Link>,
  },
  ...pressSlides, // 기사는 최신순(e스포츠 대회가 첫 기사)
]


/**
 * PC 홈(2026-11-09 사용자 시안 → 2026-11-10 새 시안, 사이드 메뉴 없음 · 상단 메뉴).
 * 판: 슬라이드(왼쪽) + 접속자 카드(HomeProfileCard: 인사·종 알림·이달 예산, 오른쪽) / 바로가기 아이콘 줄(HomeShortcuts) / 더채움 소식(NoticeBoard: 공지사항·홍보) + 인스타그램 4칸(C, 엇갈린 높이).
 * 판 아래: 사진 카드 3개(D) · 넓은 배너(E, 오른쪽 아래 로고 색 곡선). 종 알림·사용자 정보·로그아웃은 이 화면에서만 머리 줄 대신 접속자 카드에. 예전 홈(오늘 할 일)은 /home/sidebar.
 */
export default function Home() {
  const [params] = useSearchParams()
  const accountId = workspaceAccountId(params)
  useEffect(() => { document.title = '홈 · 더채움' }, [])

  return (
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
  )
}
