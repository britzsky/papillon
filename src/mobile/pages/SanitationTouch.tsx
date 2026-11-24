import TouchLayout from '../TouchLayout'
import { useHygieneBoard } from '../../features/sanitation/useHygieneBoard'
import HygieneBoard from '../../pages/sanitation/HygieneBoard'
import './SanitationTouch.css'

/**
 * 위생 점검(태블릿·휴대폰). PC 위생 점검 관리와 같은 HygieneBoard·useHygieneBoard(기존 ERP 위생관리 기록).
 * 거래처는 위 '관리 거래처'(본사 선택, 거래처 계정 고정). 사진은 휴대폰 카메라로 바로 찍어 올릴 수 있다.
 */
/** 휴대폰(700px 미만) 여부 — 화면을 열 때 한 번만 */
const IS_PHONE = typeof window !== 'undefined' && !window.matchMedia?.('(min-width: 700px)').matches

export default function SanitationTouch() {
  const board = useHygieneBoard()
  return <TouchLayout title={IS_PHONE ? '위생점검관리' : '위생 점검'} subtitle={board.accountName || undefined}>
    <div className="sn-board"><HygieneBoard board={board} compact={IS_PHONE} /></div>
  </TouchLayout>
}
