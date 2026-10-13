/** 터치 화면용 선 아이콘(24px 격자, currentColor). 새 아이콘은 PATHS에 추가한다. */
const PATHS = {
  home: 'M3 10.5 12 3l9 7.5M5 9v11h5v-6h4v6h5V9',
  meals: 'M4 4h16v16H4zM4 9h16M9 4v16M13 13h4M13 16h3',
  order: 'M3 4h2l2.4 11h11.2L21 7H6.2M9 20a1 1 0 1 0 0-.01M17 20a1 1 0 1 0 0-.01',
  inventory: 'M3 7.5 12 3l9 4.5v9L12 21l-9-4.5zM3 7.5l9 4.5 9-4.5M12 12v9',
  sanitation: 'M12 3 5 6v5c0 4.5 3 8.5 7 10 4-1.5 7-5.5 7-10V6zM9 12l2 2 4-4',
  hq: 'M4 21V5l8-2v18M12 8h8v13M8 8h.01M8 12h.01M8 16h.01M16 12h.01M16 16h.01M2 21h20',
  logout: 'M15 4h4v16h-4M10 8l-4 4 4 4M6 12h11',
  store: 'M4 10v10h16V10M3 10l2-6h14l2 6zM9 20v-5h6v5',
  check: 'M5 12.5 10 17 19 7',
  chevronLeft: 'M15 5l-7 7 7 7',
  chevronRight: 'M9 5l7 7-7 7',
  calendar: 'M4 6h16v14H4zM4 10h16M8 3v5M16 3v5',
  users: 'M9 11a4 4 0 1 0 0-.01M2 21c0-4 3-6 7-6s7 2 7 6M17 11a3 3 0 1 0-1-5.8M22 20c0-3-2-5-5-5.5',
  alert: 'M12 3 2 20h20zM12 10v4M12 17h.01',
  truck: 'M2 6h11v10H2zM13 10h5l3 3v3h-8M6 19a2 2 0 1 0 0-.01M17 19a2 2 0 1 0 0-.01',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4',
  refresh: 'M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7',
  close: 'M6 6l12 12M18 6 6 18',
  box: 'M4 8h16v12H4zM3 4h18v4H3zM10 12h4',
  flame: 'M12 21c-4 0-7-3-7-7 0-3 2-5 3-7 1 2 2 3 3 3 0-3 1-5 3-7 1 3 5 6 5 11 0 4-3 7-7 7z',
} as const

export type TouchIconName = keyof typeof PATHS

export default function TouchIcon({ name, size = 24 }: { name: TouchIconName; size?: number }) {
  return <svg className="t-icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={PATHS[name]} />
  </svg>
}
