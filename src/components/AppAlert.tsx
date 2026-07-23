import './AppAlert.css'

export type AppAlertState = {
  type: 'success' | 'error'
  title: string
  message: string
}

type AppAlertProps = {
  alert: AppAlertState | null
  onClose: () => void
}

function AppAlert({ alert, onClose }: AppAlertProps) {
  if (!alert) {
    return null
  }

  return (
    <div className="app-alert-backdrop" role="presentation" onClick={onClose}>
      <section
        className={`app-alert is-${alert.type}`}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="app-alert-title"
        aria-describedby="app-alert-message"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="app-alert__icon" aria-hidden="true">
          {alert.type === 'success' ? '✓' : '!'}
        </div>
        <div className="app-alert__body">
          <h2 id="app-alert-title">{alert.title}</h2>
          <p id="app-alert-message">{alert.message}</p>
        </div>
        <button type="button" className="app-alert__button" onClick={onClose} autoFocus>
          확인
        </button>
      </section>
    </div>
  )
}

export default AppAlert
