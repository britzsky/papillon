import type { ReactNode } from 'react'

/** 식단표 관리 빠른메뉴 아이콘(홈 바로가기와 같은 선 아이콘) */
const icon = (children: ReactNode) => <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
export const QUICK_ICONS = {
  edit: icon(<><path d="M4 20h4L19 9l-4-4L4 16z" /><path d="M13.5 6.5l4 4" /></>),
  print: icon(<><path d="M7 9V3h10v6" /><rect x="3" y="9" width="18" height="8" rx="2" /><path d="M7 14h10v7H7z" /></>),
  order: icon(<><path d="M3 4h2l2.2 10.5a1.5 1.5 0 0 0 1.5 1.2h8.6a1.5 1.5 0 0 0 1.5-1.1L21 8H6.2" /><circle cx="9.5" cy="19.5" r="1.3" /><circle cx="17" cy="19.5" r="1.3" /></>),
  stock: icon(<><path d="M21 8 12 3 3 8v8l9 5 9-5z" /><path d="M3 8l9 5 9-5M12 13v8" /></>),
  recipe: icon(<><path d="M4 13h16a8 8 0 0 1-16 0z" /><path d="M2 21h20M12 5v3M8.5 6.5l1 2M15.5 6.5l-1 2" /></>),
}
