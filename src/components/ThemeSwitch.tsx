import type { HomeTheme } from '../features/home/homeTheme'

/**
 * 머리 줄 맨 오른쪽 테마 스위치(2026-11-10 시안: 달 · 스위치 · 해). 스위치를 누르면 바뀌고, 달·해를 눌러 바로 고를 수도 있다.
 * 화면 읽기에는 '어두운 테마' 켜짐/꺼짐 스위치 하나로 읽힌다(달·해 그림은 숨김, 클릭만 받음).
 */
export default function ThemeSwitch({ theme, onChange }: { theme: HomeTheme; onChange: (next: HomeTheme) => void }) {
  const dark = theme === 'dark'
  return (
    <div className={`theme-switch${dark ? ' is-dark' : ''}`}>
      <span className="theme-switch__icon is-moon" aria-hidden="true" onClick={() => onChange('dark')} title="어두운 테마">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M20.5 14.6A8.5 8.5 0 0 1 9.4 3.5a8.5 8.5 0 1 0 11.1 11.1z" /></svg>
      </span>
      <button type="button" role="switch" aria-checked={dark} aria-label="어두운 테마" title={dark ? '밝은 테마로' : '어두운 테마로'}
        className="theme-switch__track" onClick={() => onChange(dark ? 'light' : 'dark')}>
        <span className="theme-switch__thumb" aria-hidden="true" />
      </button>
      <span className="theme-switch__icon is-sun" aria-hidden="true" onClick={() => onChange('light')} title="밝은 테마">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
          <circle cx="12" cy="12" r="4" fill="currentColor" stroke="none" />
          <path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6" />
        </svg>
      </span>
    </div>
  )
}
