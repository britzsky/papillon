import Swal from 'sweetalert2'
import 'sweetalert2/dist/sweetalert2.min.css'
import './dialog.css'
import type { BatchResult } from '../api/mixedProcurement'

/**
 * 화면 알림·확인 창(sweetalert2, 2026-11-17 사용자 요청: 브라우저 기본 confirm·AppAlert 대신 예쁜 창).
 * - showAlert: 확인 버튼 하나. 닫히면 끝나는 Promise.
 * - confirmDialog: 예/아니오. window.confirm 대신 `if (!(await confirmDialog('...'))) return`.
 * 문구 안 줄바꿈(\n)은 그대로 보인다(dialog.css white-space: pre-line).
 */
const base = Swal.mixin({
  confirmButtonText: '확인',
  cancelButtonText: '취소',
  confirmButtonColor: '#00c7ae',
  cancelButtonColor: '#94a3b8',
  reverseButtons: true,
  focusCancel: false,
  customClass: { container: 'app-swal' },
})

export type DialogType = 'success' | 'error' | 'warning' | 'info'

export async function showAlert(type: DialogType, title: string, message = ''): Promise<void> {
  await base.fire({ icon: type, title, text: message || undefined })
}

export async function confirmDialog(message: string, options: { title?: string; confirmText?: string; danger?: boolean } = {}): Promise<boolean> {
  const result = await base.fire({
    icon: options.danger ? 'warning' : 'question',
    title: options.title || '확인',
    text: message,
    showCancelButton: true,
    confirmButtonText: options.confirmText || '확인',
    confirmButtonColor: options.danger ? '#e5484d' : '#00c7ae',
  })
  return result.isConfirmed
}

const SUCCESS = ['ORDERED', 'CONFIRMED', 'RECEIVED', 'PARTIAL_RECEIVED', 'NOT_RECEIVED']
const FAILED = ['FAILED', 'VALIDATION_FAILED', 'PARTIAL_FAILED', 'CANCELED']

/** 발주 결과 알림: 공급사별 성공·실패·확인 필요를 한 창에 */
export async function showOrderResult(result: BatchResult): Promise<void> {
  const orders = result.orders || []
  const ok = orders.filter(o => SUCCESS.includes(o.status))
  const failed = orders.filter(o => FAILED.includes(o.status))
  const pending = orders.filter(o => !SUCCESS.includes(o.status) && !FAILED.includes(o.status))
  const line = (o: BatchResult['orders'][number], label: string) => `${o.supplier_name} · ${label}${o.message ? ` (${o.message})` : ''}`
  const lines = [...ok.map(o => line(o, '발주 완료')), ...failed.map(o => line(o, '발주 실패')), ...pending.map(o => line(o, '결과 확인 필요'))]
  if (!orders.length) return showAlert('warning', '발주 결과를 확인해주세요', '공급사 발주 결과가 없습니다.')
  if (!failed.length && !pending.length) return showAlert('success', '발주가 완료되었습니다', lines.join('\n'))
  if (!ok.length && !pending.length) return showAlert('error', '발주에 실패했습니다', lines.join('\n'))
  return showAlert('warning', failed.length ? '일부 발주에 실패했습니다' : '발주 결과를 확인해주세요', lines.join('\n'))
}
