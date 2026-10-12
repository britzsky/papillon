export function OrderStatusBadge({ status, label }: { status: string; label: string }) {
  const tone = ['FAILED', 'PARTIAL_FAILED'].includes(status) ? 'danger'
    : ['UNKNOWN', 'SENDING', 'NOT_RECEIVED'].includes(status) ? 'warning'
    : ['ORDERED', 'CONFIRMED', 'RECEIVED'].includes(status) ? 'success' : 'neutral'
  return <span className={`workspace-status workspace-status--${tone}`}>{label}</span>
}
