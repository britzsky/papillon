import { BrandCurves } from './HeroSlider'
import { HOME_READY_STEPS, type HomeReadyKey } from '../features/home/homeReady'
import logo from '../assets/logo/thefull.png'
import logoDark from '../assets/logo/thefull-dark.png'
import './HomeSplash.css'

const darkTheme = () => { try { return localStorage.getItem('home_theme') === 'dark' } catch { return false } }

/**
 * 로그인 직후 홈 준비 화면(전체 화면). 단계별로 끝난 것에 체크, 진행 막대 = 끝난 단계 비율.
 * 로그인 확인 단계(WorkspaceBoundary)와 홈 조회 단계(Home)가 같은 모양으로 이어 그린다. 흐름은 features/home/homeReady.ts
 */
export default function HomeSplash({ done, leaving = false }: { done: ReadonlySet<HomeReadyKey>; leaving?: boolean }) {
  const total = HOME_READY_STEPS.length
  const count = HOME_READY_STEPS.filter(step => done.has(step.key)).length
  // 아무것도 안 끝났어도 막대가 조금은 보이게
  const percent = Math.max(6, Math.round(count / total * 100))
  const dark = darkTheme()
  return (
    <div className={`rd home-splash${leaving ? ' is-leaving' : ''}`} data-theme={dark ? 'dark' : 'light'} role="status" aria-live="polite" aria-label={`홈 화면을 준비하고 있습니다. ${count}/${total}`}>
      <div className="home-splash__curves" aria-hidden="true"><BrandCurves /></div>
      <div className="home-splash__panel">
        <img className="home-splash__logo" src={dark ? logoDark : logo} alt="더채움" />
        <p className="home-splash__message">홈 화면을 준비하고 있습니다</p>
        <div className="home-splash__bar" aria-hidden="true"><span style={{ width: `${percent}%` }} /></div>
        <ul className="home-splash__steps">
          {HOME_READY_STEPS.map(step => {
            const ok = done.has(step.key)
            return <li key={step.key} className={ok ? 'is-done' : ''}>
              <span className="home-splash__mark" aria-hidden="true">
                {ok ? <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg> : null}
              </span>
              {step.label}<span className="rd-sr-only">{ok ? ' 완료' : ' 준비 중'}</span>
            </li>
          })}
        </ul>
      </div>
    </div>
  )
}
