import WorkspaceIcon, { type WorkspaceIconName } from './WorkspaceIcon'

const steps: { label: string; icon: WorkspaceIconName }[] = [
  { label: '식단', icon: 'operations' },
  { label: '필요 식재료', icon: 'product' },
  { label: '재고 확인', icon: 'inventory' },
  { label: '공급사 상품', icon: 'headquarters' },
  { label: '발주', icon: 'order' },
  { label: '입고', icon: 'inventory' },
]

export default function ProcurementFlow({ active }: { active?: string }) {
  return <ol className="procurement-flow" aria-label="식단에서 입고까지의 업무 흐름">
    {steps.map(step => <li key={step.label} className={active === step.label ? 'is-current' : ''} aria-current={active === step.label ? 'step' : undefined}>
      <span className="procurement-flow__icon"><WorkspaceIcon name={step.icon} /></span>
      <span>{step.label}</span>
    </li>)}
  </ol>
}
