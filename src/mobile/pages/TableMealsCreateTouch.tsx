import { useState, type ReactNode } from 'react'
import TouchLayout from '../TouchLayout'
import TouchIcon, { type TouchIconName } from '../TouchIcon'
import MealCalories from '../../features/tableMeals/MealCalories'
import MealPlanImpact from '../../components/MealPlanImpact'
import PdfMenuRegisterModal from '../../pages/operations/PdfMenuRegisterModal'
import { mealPlanTypeOptions } from '../../pages/operations/menuManagerShared'
import { formatQty } from '../../utils/formatQty'
import { formatDateValue } from '../../features/tableMeals/tableMealsView'
import {
  AUTO_WEEKDAY_LABELS, MANUAL_FOOD_TYPE_OPTIONS, PDF_EXCLUDED, formatDateLabel, useTableMealsWorkspace, type ParsedDay,
} from '../../features/tableMeals/useTableMealsWorkspace'
import './TableMealsCreateTouch.css'

type Method = 'auto' | 'manual' | 'pdf'
const METHODS: { key: Method; label: string; hint: string; icon: TouchIconName }[] = [
  { key: 'auto', label: '자동으로 만들기', hint: '거래처 메뉴와 예산으로 한 주를 채웁니다', icon: 'refresh' },
  { key: 'manual', label: '직접 만들기', hint: '칸을 누르고 메뉴를 골라 넣습니다', icon: 'meals' },
  { key: 'pdf', label: 'PDF 불러오기', hint: '받은 식단표 PDF의 글자를 읽어 옵니다', icon: 'box' },
]

/**
 * 식단표 만들기(태블릿·휴대폰). 주차·식단 유형·예정 식수 → 방법(자동·직접·PDF) → 편집기(칸을 누르고 오른쪽 메뉴를 넣기) → 저장 전 부족재고 확인.
 * 로직은 PC 식단표 관리와 같은 useTableMealsWorkspace. PDF 미등록 메뉴 등록 창·변경 영향은 PC 부품을 그대로 쓴다.
 */
export default function TableMealsCreateTouch({ onClose }: { onClose: () => void }) {
  // ref(파일 입력·복원 설정)는 화면에서 따로 쓰고, 나머지 값만 하위 부품에 넘긴다(렌더 중 ref 접근 금지 규칙)
  const { fileInputRef, restoredSettings: _restored, ...w } = useTableMealsWorkspace()
  void _restored
  const [method, setMethod] = useState<Method>('auto')
  const [weeklyOpen, setWeeklyOpen] = useState(false)
  const [y, mo] = w.selectedTableMonth.split('-').map(Number)
  const shiftMonth = (delta: number) => { const d = new Date(y, mo - 1 + delta, 1); w.setSelectedTableMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`) }
  const ready = Boolean(w.selectedAccountId) && Number(w.plannedServings) > 0
  const messages = [w.manualMessage, w.autoGenerateMessage, w.tableSaveMessage, w.aiMatchMessage, w.pdfLinkMessage].filter(Boolean)

  const toolbar = <button type="button" className="t-btn" onClick={onClose}><TouchIcon name="chevronLeft" />식단표로 돌아가기</button>

  if (w.isManualEditorOpen) return <Editor w={w} toolbar={toolbar} />

  return <TouchLayout title="식단표 만들기" subtitle={w.selectedAccountName || undefined} toolbar={toolbar} onAccountChange={w.setSelectedAccountId}>
    <section className="t-card tc-setup">
      <div className="tc-setup__row">
        <div className="tc-month" role="group" aria-label="월">
          <button type="button" className="t-btn is-ghost is-icon" aria-label="이전 달" onClick={() => shiftMonth(-1)}><TouchIcon name="chevronLeft" /></button>
          <strong>{y}년 {mo}월</strong>
          <button type="button" className="t-btn is-ghost is-icon" aria-label="다음 달" onClick={() => shiftMonth(1)}><TouchIcon name="chevronRight" /></button>
        </div>
        <label className="tc-field tc-servings">식사당 예정 식수<input type="text" inputMode="numeric" value={w.plannedServings} placeholder="예: 120" onChange={e => w.setPlannedServings(e.target.value.replace(/[^0-9]/g, ''))} /></label>
      </div>
      <span className="tc-label">주차</span>
      <div className="tc-chips">{w.currentMonthWeeks.map(week => <button key={week.value} type="button" className={w.autoWeekValue === week.value ? 'is-active' : ''} onClick={() => w.setAutoWeekValue(week.value)}>
        {week.label}<small>{formatDateLabel(week.dates[0])}~{formatDateLabel(week.dates[week.dates.length - 1])}</small>
      </button>)}</div>
      <span className="tc-label">식단 유형</span>
      <div className="tc-chips">{mealPlanTypeOptions.map(option => <button key={option.value} type="button" className={w.selectedMealPlanType === Number(option.value) ? 'is-active' : ''} onClick={() => w.setSelectedMealPlanType(Number(option.value))}>{option.text}</button>)}</div>
      {w.selectedAccountId && w.selectedAutoWeek && w.configuredMealSlotRows.length > 0 && <div className="tc-weekly">
        <span>주간 식사 편성 · {Object.keys(w.weeklyMealSettings).length > 0 ? `기본값에서 ${Object.keys(w.weeklyMealSettings).length}개 바꿈` : '고객사 기본값'}</span>
        <button type="button" className="t-btn is-small is-soft" onClick={() => setWeeklyOpen(true)}>편성 바꾸기</button>
      </div>}
      {w.selectedAccountId && w.configuredMealSlotRows.length === 0 && <p className="t-msg is-warn">고객사 관리에서 제공할 식사를 먼저 정해 주세요.</p>}
    </section>

    {!w.selectedAccountId && <p className="t-msg">위에서 거래처를 고르세요.</p>}
    {messages.map(text => <p key={text} className="t-msg is-warn tc-msg" role="status">{text}</p>)}
    {w.accountMenuError && <p className="t-msg is-error">{w.accountMenuError}</p>}

    <div className="tc-methods">{METHODS.map(m => <button key={m.key} type="button" className={`t-card tc-method${method === m.key ? ' is-selected' : ''}`} onClick={() => setMethod(m.key)}>
      <span className="tc-method__icon"><TouchIcon name={m.icon} size={28} /></span><strong>{m.label}</strong><small>{m.hint}</small>
    </button>)}</div>

    {method === 'auto' && <section className="t-card tc-action">
      <p>거래처 메뉴·식사별 기본 분류·1인 예산으로 {w.selectedAutoWeek?.label || '고른 주'} 식단을 자동으로 채웁니다. 만든 뒤 칸별로 고칠 수 있습니다.</p>
      <div className="tc-action__buttons">
        <button type="button" className="t-btn is-primary is-large" disabled={!ready || w.isAccountMenuLoading} onClick={() => void w.handleAutoGenerate()}>{w.isAccountMenuLoading ? '메뉴 불러오는 중…' : '자동 식단 만들기'}</button>
        <button type="button" className="t-btn is-large" disabled={!w.autoGeneratedResult || w.isTableSaving} onClick={w.openAutoEditor}>만든 식단 고치기</button>
        <button type="button" className="t-btn is-soft is-large" disabled={!w.autoGeneratedResult || w.isTableSaving} onClick={() => void w.handleSaveAutoTableMeals()}>{w.isTableSaving ? '확인 중…' : '그대로 저장'}</button>
      </div>
      {!ready && <p className="tc-hint">예정 식수를 넣어야 부족재고까지 계산할 수 있습니다.</p>}
    </section>}

    {method === 'manual' && <section className="t-card tc-action">
      <p>빈 식단표를 열고 요일·식사 칸마다 거래처 메뉴를 골라 넣습니다. '자동 추천으로 채우기'로 시작해도 됩니다.</p>
      <button type="button" className="t-btn is-primary is-large" disabled={!w.selectedAccountId || w.isAccountMenuLoading} onClick={() => void w.openManualEditor()}>{w.isAccountMenuLoading ? '메뉴 불러오는 중…' : '빈 식단표 열기'}</button>
    </section>}

    {method === 'pdf' && <section className="t-card tc-action">
      <p>PDF 글자를 읽어 요일·식사별로 나눕니다. 파일은 서버에 저장하지 않습니다.</p>
      <div className="tc-action__buttons">
        <label className="t-btn is-primary is-large tc-file">PDF 고르기<input ref={fileInputRef} type="file" accept=".pdf,application/pdf" onChange={w.handleFileChange} /></label>
        <button type="button" className="t-btn is-large" disabled={!w.rawParsedResult || w.isAiMatching} onClick={() => void w.handleAiMatch()}>{w.isAiMatching ? 'AI 매칭 중…' : 'AI로 메뉴 맞추기'}</button>
        <button type="button" className="t-btn is-soft is-large" disabled={!w.parsedPdfResult} onClick={() => void w.transferPdfToEditor()}>편집기로 옮기기</button>
      </div>
      <button type="button" className={`tc-toggle${w.rememberPdfLinks ? ' is-on' : ''}`} aria-pressed={w.rememberPdfLinks} onClick={() => w.setRememberPdfLinks(!w.rememberPdfLinks)}>
        <span className="tc-toggle__box">{w.rememberPdfLinks && <TouchIcon name="check" size={16} />}</span>직접 고른 메뉴 연결 기억(다음 PDF부터 자동 연결)
      </button>
      {w.isPdfParsing && <p className="t-msg" role="status">PDF를 읽는 중…</p>}
      {w.pdfError && <p className="t-msg is-error">{w.pdfError}</p>}
      {w.parsedPdfResult && <PdfResult w={w} />}
    </section>}

    {weeklyOpen && w.selectedAutoWeek && <WeeklySheet w={w} onClose={() => setWeeklyOpen(false)} />}
    {w.registerTarget && <PdfMenuRegisterModal accountId={w.selectedAccountId} accountName={w.selectedAccountName} pdfText={w.registerTarget.text} context={w.registerTarget.context}
      slotCode={w.registerTarget.slotCode} mealPlanType={w.selectedMealPlanType} accountMenus={w.accountMenuItems} onClose={() => w.setRegisterTarget(null)} onLinked={w.handleRegisteredMenu} />}
    <StockCheckSheet w={w} />
  </TouchLayout>
}

type W = Omit<ReturnType<typeof useTableMealsWorkspace>, 'fileInputRef' | 'restoredSettings'>

/** PDF 해석 결과: 요일 카드 안에 식사별 메뉴. 맞춘 메뉴는 초록, 못 맞춘 글자는 '등록' 또는 '빼기' */
function PdfResult({ w }: { w: W }) {
  const result = w.displayedMealResult
  if (!result) return null
  return <div className="tc-pdf">
    <p className="tc-hint">텍스트 {result.textItemCount}건 · 맞춘 메뉴 {w.matchedCount}건{result.unconfiguredSlots?.length ? ` · ${result.unconfiguredSlots.join(', ')}는 이 거래처 식사 설정에 없어 빠집니다` : ''}</p>
    <div className="tc-pdf__days">{result.days.map(day => <article key={day.id} className="tc-pdf__day">
      <header><strong>{day.label}</strong><small>{day.date}</small></header>
      {w.configuredMealSlotRows.map(slot => {
        const items = day.meals[slot.key] ?? []
        if (!items.length) return null
        return <div key={slot.key} className="tc-pdf__slot">
          <span className="tc-pdf__slot-name">{slot.label}</span>
          <div className="tc-pdf__items">{items.map((item, index) => item.excluded
            ? <button key={index} type="button" className="tc-pill is-excluded" onClick={() => w.setPdfOverride(day.id, slot.key, index, null)}><s>{item.text}</s> 되살리기</button>
            : item.matchedMenu
              ? <span key={index} className="tc-pill is-matched">{item.matchedMenu.menu_name}{item.text !== item.matchedMenu.menu_name ? <small>({item.text})</small> : null}</span>
              : <span key={index} className="tc-pill is-unmatched">
                {item.text}
                <button type="button" onClick={() => w.openRegisterModal(item.text, day, slot.key)}>등록</button>
                <button type="button" onClick={() => w.setPdfOverride(day.id, slot.key, index, PDF_EXCLUDED)}>빼기</button>
                {w.getAiMatchedMenu(item.text) && <small>AI 후보: {w.getAiMatchedMenu(item.text)?.menu_name}</small>}
              </span>)}</div>
        </div>
      })}
    </article>)}</div>
  </div>
}

/** 편집기: 요일 칸 → 식사 카드(메뉴 빼기·이 칸에 넣기), 오른쪽 거래처 메뉴 목록(누르면 고른 칸에 넣기) */
function Editor({ w, toolbar }: { w: W; toolbar: ReactNode }) {
  const days = w.manualDays
  const target = w.manualTarget
  const day = days.find(d => d.id === target?.dayId) || days[0]
  const rows = w.configuredMealSlotRows
  const targetRow = rows.find(r => r.id === target?.rowId)
  const pick = (d: ParsedDay, rowId: string, key: string) => w.setManualTarget({ dayId: d.id, rowId, mealKey: key })

  const aside = <div className="tc-panel">
    <div className="tc-panel__head">
      <h2>메뉴 넣기</h2>
      <p>{day && targetRow ? `${day.label} ${day.date?.slice(5) || ''} · ${targetRow.label} 칸에 넣습니다` : '왼쪽에서 칸을 먼저 고르세요'}</p>
      <label className="t-chip tc-search"><TouchIcon name="search" /><input type="search" value={w.manualSearchText} placeholder="메뉴 검색" onChange={e => w.setManualSearchText(e.target.value)} /></label>
      <div className="tc-chips tc-chips--small">{MANUAL_FOOD_TYPE_OPTIONS.map(option => <button key={option.value || 'all'} type="button" className={w.manualFoodTypeFilter === option.value ? 'is-active' : ''} onClick={() => w.setManualFoodTypeFilter(option.value)}>{option.label}</button>)}</div>
    </div>
    <ul className="tc-menus">{w.filteredManualMenus.slice(0, 120).map(menu => <li key={menu.menu_id}>
      <button type="button" disabled={!target} onClick={() => w.addManualMenu(menu)}>
        <strong>{menu.menu_name}</strong>
        <small>{menu.meal_category}{menu.calories_per_serving ? ` · ${menu.calories_per_serving}kcal` : ''}</small>
        <span aria-hidden="true">＋</span>
      </button>
    </li>)}</ul>
    {w.filteredManualMenus.length === 0 && <p className="tc-hint tc-panel__empty">조건에 맞는 거래처 메뉴가 없습니다.</p>}
    <div className="tc-panel__actions">
      <label className="tc-field">식사당 예정 식수<input type="text" inputMode="numeric" value={w.plannedServings} onChange={e => w.setPlannedServings(e.target.value.replace(/[^0-9]/g, ''))} /></label>
      <button type="button" className="t-btn is-primary is-large is-block" disabled={w.isTableSaving} onClick={() => void w.saveManualTableMeals()}>{w.isTableSaving ? '확인 중…' : '저장'}</button>
    </div>
  </div>

  return <TouchLayout title={w.mealEditorSource === 'auto' ? '자동 식단 고치기' : w.mealEditorSource === 'pdf' ? 'PDF 식단 고치기' : '식단 직접 만들기'} subtitle={`${w.selectedAccountName} · ${w.selectedAutoWeek?.label || ''}`} toolbar={<>
    {toolbar}
    <button type="button" className="t-btn is-soft" onClick={w.fillManualWithAutoRecommendation}>자동 추천으로 채우기</button>
    <button type="button" className="t-btn is-ghost" onClick={w.closeManualEditor}>편집 닫기</button>
  </>} aside={aside} hideAccount>
    {[w.manualMessage, w.tableSaveMessage].filter(Boolean).map(text => <p key={text} className="t-msg is-warn tc-msg" role="status">{text}</p>)}
    <div className="t-tabs" role="tablist" aria-label="요일">{days.map(d => {
      const count = rows.reduce((sum, r) => sum + w.getManualMealItems(d, r).length, 0)
      return <button key={d.id} type="button" role="tab" aria-selected={d.id === day?.id} className={`t-tab${d.id === day?.id ? ' is-active' : ''}`}
        onClick={() => rows[0] && pick(d, rows[0].id, rows[0].key)}>
        <TouchIcon name="calendar" /><strong>{d.label}</strong><small>{d.date && d.date.length > 5 ? d.date.slice(5).replace('-', '.') : d.date} · {count}개</small>
      </button>
    })}</div>
    {day && <div className="tc-slots">{rows.map(row => {
      const items = w.getManualMealItems(day, row)
      const active = target?.dayId === day.id && target?.rowId === row.id
      return <article key={row.id} className={`t-card tc-slot${active ? ' is-selected' : ''}`} onClick={() => pick(day, row.id, row.key)}>
        <header>
          <h3>{row.label}</h3>
          <MealCalories menus={items.map(item => item.matchedMenu)} />
          {active ? <span className="t-badge is-accent">여기에 넣는 중</span> : <span className="t-badge">눌러서 고르기</span>}
        </header>
        <ul>{items.map((item, index) => <li key={`${item.text}-${index}`} className={item.matchedMenu ? '' : 'is-unmatched'}>
          <span>{item.matchedMenu?.menu_name || item.text}{item.matchedMenu ? '' : ' (미등록)'}</span>
          <button type="button" aria-label="빼기" onClick={e => { e.stopPropagation(); w.removeManualMenu(day.id, row.id, row.key, index) }}><TouchIcon name="close" size={16} /></button>
        </li>)}</ul>
        {items.length === 0 && <p className="tc-hint">비어 있습니다. 이 칸을 고르고 오른쪽에서 메뉴를 누르세요.</p>}
        {items.length > 0 && <button type="button" className="t-btn is-small is-ghost" onClick={e => { e.stopPropagation(); w.clearManualMeal(day.id, row.id, row.key) }}>이 칸 비우기</button>}
      </article>
    })}</div>}
    <StockCheckSheet w={w} />
  </TouchLayout>
}

/** 주간 식사 편성: 날짜 × 식사마다 분류·식단유형(고객사 기본값에서 바꾼 것만 저장) */
function WeeklySheet({ w, onClose }: { w: W; onClose: () => void }) {
  const week = w.selectedAutoWeek!
  return <div className="t-sheet-backdrop" role="presentation" onClick={onClose}>
    <section className="t-sheet tc-weekly-sheet" role="dialog" aria-modal="true" aria-labelledby="tc-weekly-title" onClick={e => e.stopPropagation()}>
      <header className="t-sheet__head"><h2 id="tc-weekly-title">주간 식사 편성</h2><p>{week.label} · 특별한 날만 바꾸세요</p></header>
      <div className="t-sheet__body">{week.dates.map(date => <section key={formatDateValue(date)} className="tc-weekly-day">
        <h3>{formatDateLabel(date)} ({AUTO_WEEKDAY_LABELS[(date.getDay() + 6) % 7]})</h3>
        {w.configuredMealSlotRows.map(slot => {
          const key = `${formatDateValue(date)}:${slot.code}`
          const profile = w.accountMealConfiguration?.profiles.find(item => item.meal_slot_code === slot.code)
          const setting = w.weeklyMealSettings[key]
          const foodType = setting?.food_type ?? profile?.default_food_type ?? ([1, 3, 4, 6, 7, 8].includes(slot.code) ? 6 : 1)
          const planType = setting?.meal_plan_type ?? profile?.default_meal_plan_type ?? w.selectedMealPlanType
          return <div key={slot.id} className={`tc-weekly-row${setting ? ' is-changed' : ''}`}>
            <strong>{slot.label}</strong>
            <select aria-label={`${slot.label} 식사분류`} value={foodType} onChange={e => w.updateWeeklyMealSetting(date, slot, { food_type: Number(e.target.value) })}>
              {MANUAL_FOOD_TYPE_OPTIONS.filter(o => o.value).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <select aria-label={`${slot.label} 식단유형`} value={planType} onChange={e => w.updateWeeklyMealSetting(date, slot, { meal_plan_type: Number(e.target.value) })}>
              {mealPlanTypeOptions.map(o => <option key={o.value} value={o.value}>{o.text}</option>)}
            </select>
          </div>
        })}
      </section>)}</div>
      <footer className="t-sheet__actions">
        <button type="button" className="t-btn is-large" onClick={() => w.setWeeklyMealSettings({})}>기본값으로</button>
        <button type="button" className="t-btn is-primary is-large" onClick={onClose}>적용</button>
      </footer>
    </section>
  </div>
}

/** 저장 전 부족재고·변경 영향 확인(서버 계산). 부족하면 먼저 발주하거나 식단만 저장 */
function StockCheckSheet({ w }: { w: W }) {
  const check = w.savedStockCheck
  if (!check) return null
  const rows = check.result?.ingredients || []
  return <div className="t-sheet-backdrop" role="presentation" onClick={() => w.setSavedStockCheck(null)}>
    <section className="t-sheet tc-stock" role="dialog" aria-modal="true" aria-labelledby="tc-stock-title" onClick={e => e.stopPropagation()}>
      <header className="t-sheet__head"><h2 id="tc-stock-title">저장 전 재고 확인</h2><p>{check.loading ? '식단 필요량과 재고를 확인하고 있습니다…' : rows.length ? `부족하거나 확인이 필요한 식재료 ${rows.length}개` : '추가로 발주할 식재료가 없습니다'}</p></header>
      <div className="t-sheet__body">
        {check.error && <p className="t-msg is-error">부족량 확인 실패: {check.error}</p>}
        <ul className="tc-stock__list">{rows.map(row => <li key={row.ingredient_id}>
          <div><strong>{row.ingredient_name}</strong>{row.issues.map(issue => <small key={issue} className="tc-stock__issue">{issue}</small>)}</div>
          <dl><div><dt>필요</dt><dd>{formatQty(row.required_qty, row.base_unit)}</dd></div><div><dt>현재</dt><dd>{formatQty(row.current_qty, row.base_unit)}</dd></div><div className="is-short"><dt>부족</dt><dd>{formatQty(row.shortage_qty, row.base_unit)}</dd></div></dl>
        </li>)}</ul>
        <div className="t-pc-embed"><MealPlanImpact impact={check.impact} /></div>
      </div>
      <footer className="t-sheet__actions tc-stock__actions">
        <button type="button" className="t-btn" onClick={() => w.setSavedStockCheck(null)}>닫기</button>
        <button type="button" className="t-btn" disabled={check.loading} onClick={() => void w.preparePlan(check.payload, check.saveWhenSufficient)}>다시 확인</button>
        <button type="button" className="t-btn is-soft" disabled={check.loading || !rows.length} onClick={() => w.openDraftProcurement(check.criteria)}>부족 식재료 먼저 발주</button>
        <button type="button" className="t-btn is-primary" disabled={check.loading || w.isTableSaving || !!check.error || rows.some(row => row.issues.length > 0)} onClick={() => void w.persistPlan(check.payload)}>식단만 저장</button>
      </footer>
    </section>
  </div>
}
