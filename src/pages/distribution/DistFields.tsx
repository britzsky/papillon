import type { ReactNode } from 'react'
import { text, type Row } from '../../api/distAdmin'

/** 협력사 관리 화면 공통 입력 칸(라벨 + 입력). 값은 Row(서버 응답 그대로)에서 읽고 patch로 바꾼다 */
export type FieldDef = {
  key: string
  label: string
  type?: 'text' | 'number' | 'date' | 'datetime-local' | 'time' | 'email' | 'tel' | 'textarea'
  options?: Record<string, string>
  placeholder?: string
  required?: boolean
  wide?: boolean
  hint?: string
  maxLength?: number
}

export function Fields({ defs, value, onChange, disabled }: { defs: FieldDef[]; value: Row; onChange: (patch: Row) => void; disabled?: boolean }) {
  return <div className="dist-fields">{defs.map(def => <Field key={def.key} def={def} value={value} onChange={onChange} disabled={disabled} />)}</div>
}

function Field({ def, value, onChange, disabled }: { def: FieldDef; value: Row; onChange: (patch: Row) => void; disabled?: boolean }) {
  const id = `dist-field-${def.key}`
  const raw = text(value[def.key])
  const current = def.type === 'datetime-local' ? raw.replace(' ', 'T').slice(0, 16) : def.type === 'time' ? raw.slice(0, 5) : raw
  let control: ReactNode
  if (def.options) {
    control = <select id={id} className="rd-input" value={current} disabled={disabled} onChange={event => onChange({ [def.key]: event.target.value })}>
      {!def.required ? <option value="">선택 안 함</option> : null}
      {Object.entries(def.options).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
    </select>
  } else if (def.type === 'textarea') {
    control = <textarea id={id} className="rd-input" rows={4} value={current} placeholder={def.placeholder} maxLength={def.maxLength} disabled={disabled}
      onChange={event => onChange({ [def.key]: event.target.value })} />
  } else {
    control = <input id={id} className="rd-input" type={def.type ?? 'text'} value={current} placeholder={def.placeholder} maxLength={def.maxLength}
      inputMode={def.type === 'number' ? 'decimal' : undefined} disabled={disabled} onChange={event => onChange({ [def.key]: event.target.value })} />
  }
  return <div className={`dist-field${def.wide ? ' is-wide' : ''}`}>
    <label htmlFor={id}>{def.label}{def.required ? <b aria-hidden="true"> *</b> : null}</label>
    {control}
    {def.hint ? <small className="rd-muted">{def.hint}</small> : null}
  </div>
}

export function Notice({ message, failed }: { message: string; failed: boolean }) {
  return message ? <p className={`dist-msg${failed ? ' is-error' : ''}`} role={failed ? 'alert' : 'status'}>{message}</p> : null
}
