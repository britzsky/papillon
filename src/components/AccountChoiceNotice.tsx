import WorkspaceAccountPicker from './WorkspaceAccountPicker'

/** 본사가 거래처가 필요한 화면을 '전체 거래처'로 열었을 때 화면 대신 보여 주는 안내(features/workspace/accountGate.ts) */
export default function AccountChoiceNotice() {
  return (
    <div className="rd rd-page">
      <section className="rd-card rd-page__empty rd-account-choice">
        <h2 className="rd-h2">관리할 거래처를 먼저 고르세요</h2>
        <p>본사 계정은 거래처를 골라 관리합니다. 한 번 고르면 다른 화면으로 옮겨도 그 거래처가 유지됩니다.</p>
        <WorkspaceAccountPicker />
      </section>
    </div>
  )
}
