import { useState } from 'react'
import { STORAGE_LABEL, text, type Row } from '../../api/distAdmin'
import { FOOD_LABEL_FIELDS, NOTICE_TYPES, parseInfo, serializeInfo, withFields, type InfoField, type InfoItem } from '../../features/dist/productInfo'

/**
 * 식품 표시사항·상품정보제공고시 입력(2026-11-04). 정해진 항목은 칸으로, 그 밖의 항목은 '항목 추가'로 이름·내용을 직접.
 * 바꿀 때마다 JSON 글자로 묶어 draft.food_label_json / draft.notice_json에 넣는다(비우면 ''). 상품을 바꾸면 key로 새로 만든다.
 */
export function FoodLabelFields({ draft, onChange, disabled }: { draft: Row; onChange: (patch: Row) => void; disabled?: boolean }) {
  const [items, setItems] = useState<InfoItem[]>(() => withFields(parseInfo(draft.food_label_json), FOOD_LABEL_FIELDS))
  const update = (next: InfoItem[]) => { setItems(next); onChange({ food_label_json: serializeInfo({ items: next }) }) }
  const fillFromBasic = () => {
    const name = `${text(draft.product_name)}${draft.option_name ? ` ${text(draft.option_name)}` : ''}`.trim()
    const content = draft.unit_content_qty ? `${text(draft.unit_content_qty)}${text(draft.unit_content_unit)}` : ''
    const basic: Record<string, string> = {
      product_name: name, origin: text(draft.origin), content,
      storage: STORAGE_LABEL[text(draft.storage_type)] ? `${STORAGE_LABEL[text(draft.storage_type)]} 보관` : '',
      shelf_life: draft.shelf_life_days ? `제조일로부터 ${text(draft.shelf_life_days)}일` : '',
    }
    update(items.map(item => (item.key && !item.value.trim() && basic[item.key] ? { ...item, value: basic[item.key] } : item)))
  }
  return <fieldset className="dist-info-form">
    <legend>식품 표시사항</legend>
    <p className="rd-muted rd-fs-sm">포장지에 적힌 표시사항을 옮겨 적습니다. 비운 칸은 더채움몰에 나오지 않습니다.</p>
    <div className="dist-actions is-start">
      <button type="button" className="rd-btn" disabled={disabled} onClick={fillFromBasic}>기본 정보로 빈칸 채우기</button>
      <small className="rd-muted">상품명·원산지·보관·내용량·소비기한</small>
    </div>
    <InfoRows idPrefix="dist-label" items={items} fields={FOOD_LABEL_FIELDS} disabled={disabled} onChange={update} />
  </fieldset>
}

export function NoticeFields({ draft, onChange, disabled }: { draft: Row; onChange: (patch: Row) => void; disabled?: boolean }) {
  const initial = parseInfo(draft.notice_json)
  const [type, setType] = useState(initial.type && NOTICE_TYPES[initial.type] ? initial.type : initial.items.length ? 'OTHER' : '')
  const [items, setItems] = useState<InfoItem[]>(() => withFields(initial, NOTICE_TYPES[type]?.fields ?? []))
  const fields = NOTICE_TYPES[type]?.fields ?? []
  const update = (nextType: string, next: InfoItem[]) => {
    setType(nextType); setItems(next)
    onChange({ notice_json: nextType ? serializeInfo({ type: nextType, type_name: NOTICE_TYPES[nextType]?.label, items: next }) : '' })
  }
  const changeType = (nextType: string) => {
    if (!nextType) {
      if (items.some(item => item.value.trim()) && !window.confirm('입력한 고시 내용을 모두 지울까요?')) return
      update('', []); return
    }
    // 종류를 바꿔도 같은 항목(key)·직접 추가한 항목의 값은 옮긴다
    update(nextType, withFields({ items: items.filter(item => item.value.trim()) }, NOTICE_TYPES[nextType].fields))
  }
  const fillFromLabel = () => {
    const label = parseInfo(draft.food_label_json).items
    const value = (keys: string[]) => keys.map(key => label.find(item => item.key === key)?.value.trim() ?? '').filter(Boolean).join('\n')
    update(type, items.map(item => {
      const field = fields.find(row => row.key === item.key)
      return field?.from && !item.value.trim() ? { ...item, value: value(field.from) } : item
    }))
  }
  return <fieldset className="dist-info-form">
    <legend>상품정보제공고시</legend>
    <p className="rd-muted rd-fs-sm">온라인 판매 때 알려야 하는 항목입니다(전자상거래 상품정보제공 고시). 상품 종류를 고르면 항목이 나옵니다. 고시 개정 때 항목을 확인하세요.</p>
    <div className="dist-actions is-start">
      <select className="rd-input dist-info-form__type" aria-label="고시 상품 종류" value={type} disabled={disabled} onChange={event => changeType(event.target.value)}>
        <option value="">입력 안 함</option>
        {Object.entries(NOTICE_TYPES).map(([key, row]) => <option key={key} value={key}>{row.label}</option>)}
      </select>
      {type && type !== 'OTHER' ? <button type="button" className="rd-btn" disabled={disabled} onClick={fillFromLabel}>식품 표시사항에서 빈칸 채우기</button> : null}
    </div>
    {type ? <InfoRows idPrefix="dist-notice" items={items} fields={fields} disabled={disabled} onChange={next => update(type, next)} /> : null}
  </fieldset>
}

function InfoRows({ idPrefix, items, fields, disabled, onChange }: { idPrefix: string; items: InfoItem[]; fields: InfoField[]; disabled?: boolean; onChange: (items: InfoItem[]) => void }) {
  const set = (index: number, patch: Partial<InfoItem>) => onChange(items.map((item, at) => (at === index ? { ...item, ...patch } : item)))
  return <>
    <div className="dist-fields">
      {items.map((item, index) => {
        const field = item.key ? fields.find(row => row.key === item.key) : undefined
        const id = `${idPrefix}-${index}`
        if (!field) {
          return <div key={index} className="dist-field is-wide dist-info-form__custom">
            <div className="dist-info-form__pair">
              <input className="rd-input" aria-label={`추가 항목 ${index + 1} 이름`} placeholder="항목 이름" maxLength={100} value={item.label} disabled={disabled}
                onChange={event => set(index, { label: event.target.value })} />
              <textarea id={id} className="rd-input" rows={2} aria-label={`추가 항목 ${index + 1} 내용`} placeholder="내용" maxLength={2000} value={item.value} disabled={disabled}
                onChange={event => set(index, { value: event.target.value })} />
              <button type="button" className="rd-btn" disabled={disabled} onClick={() => onChange(items.filter((_, at) => at !== index))} aria-label={`추가 항목 ${index + 1} 빼기`}>빼기</button>
            </div>
          </div>
        }
        return <div key={index} className={`dist-field${field.long ? ' is-wide' : ''}`}>
          <label htmlFor={id}>{field.label}</label>
          {field.long
            ? <textarea id={id} className="rd-input" rows={2} maxLength={2000} value={item.value} disabled={disabled} onChange={event => set(index, { value: event.target.value })} />
            : <input id={id} className="rd-input" maxLength={2000} value={item.value} disabled={disabled} onChange={event => set(index, { value: event.target.value })} />}
          {field.hint ? <small className="rd-muted">{field.hint}</small> : null}
        </div>
      })}
    </div>
    <div className="dist-actions is-start">
      <button type="button" className="rd-btn" disabled={disabled} onClick={() => onChange([...items, { label: '', value: '' }])}>항목 추가</button>
    </div>
  </>
}
