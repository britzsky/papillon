/*
 * 업무 순서 클릭 수 검사(2026-10-16 사용자 결정: 식단표부터 발주까지 클릭 5번 안).
 * 모의 API로 실제 화면을 열어 사용자가 누르는 횟수를 센다. 화면을 고친 뒤 넘으면 실패(종료코드 1).
 *   ① 새 주: 홈 → 사이드 '운영관리 > 식단표 관리'(펼쳐져 있음) → 자동 식단표 제작 → 저장하고 발주하기 → 발주서 확인 → 발주 보내기  (5번 이하)
 *   ② 식단 있음: 홈 '오늘 할 일'의 발주하기 → 발주서 확인 → 발주 보내기                                  (3번 이하)
 * 실행: npm run dev -- --port 5191  (다른 창)  →  node scripts/flow-clicks.cjs [스크린샷 폴더]
 * playwright가 없으면: npx -y playwright@1.56.1 install chromium 후 NODE_PATH에 playwright 위치를 주거나 PLAYWRIGHT_MODULE=경로
 */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const out = process.argv[2] || '.';
const BASE = process.env.FLOW_BASE_URL || 'http://localhost:5191';
const kst = () => new Date(Date.now() + 9 * 3600e3);
const ymd = d => d.toISOString().slice(0, 10);
const menus = [
  ['M1', '잡곡밥', '0', '0'], ['M2', '된장찌개', '1', '1'], ['M3', '제육볶음', '0', '9'], ['M4', '시금치나물', '1', '10'],
  ['M5', '배추김치', '1', '14'], ['M6', '닭볶음탕', '0', '8'], ['M7', '미역국', '1', '1'], ['M8', '계란말이', '1', '5'],
  ['M9', '쌀밥', '0', '0'], ['M10', '감자조림', '1', '8'], ['M11', '고등어구이', '0', '4'], ['M12', '콩나물무침', '1', '2'],
].map(([id, name, type, gubun], i) => ({ menu_id: id, menu_name: name, meal_category: '한식', food_type: 1, menu_type: type, menu_gubun: gubun, meal_plan_type: 0, calories_per_serving: 300, menu_cost_per_person: 600 + i * 50, menu_cost_complete: 'Y', account_id: 'A1' }));
const offer = (id, name, supplier) => ({ supplier_offer_id: id, supplier_product_id: id, supplier_name: supplier === 'OURHOME' ? '아워홈' : '웰스토리', supplier_code: supplier, external_site_code: supplier === 'OURHOME' ? 'FU0UR' : 'A0199240', external_site_name: '우리누리', supplier_item_code: 'P' + id, product_name: name, order_unit: 'EA', base_unit: 'g', base_qty: 1000, package_base_qty: 1000, purchase_price: 5000 + id, minimum_order_qty: 1, order_increment_qty: 1, recommended_qty: 2, quantity_basis: 'CALCULATED', estimated_amount: 10000, orderability_status: 'AVAILABLE', orderability_reason: 'D-1 · 마감 11:00', orderable: true, availability_reason: '', tax_type: 'No tax', lead_time_days: 1 });
const shortage = criteria => ({ criteria, unconfigured_count: 0, checked_at: new Date().toISOString(), ingredients: [
  ['I1', '돼지고기 앞다리', offer(11, '돼지앞다리 2kg', 'WELSTORY')], ['I2', '시금치', offer(12, '시금치 1kg', 'OURHOME')], ['I3', '양파', offer(13, '양파 1kg', 'WELSTORY')],
].map(([id, name, o]) => ({ ingredient_id: id, ingredient_name: name, base_unit: 'g', required_qty: 3000, safe_stock_qty: 0, current_qty: 500, incoming_qty: 0, shortage_qty: 2500, stock_status: 'RED', menu_names: ['제육볶음'], issues: [], offers: [o] })) });

async function run(name, limit, steps) {
  const b = await chromium.launch({ headless: true });
  const page = await (await b.newContext({ viewport: { width: 1600, height: 960 } })).newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', d => { errors.push('DIALOG ' + d.message().slice(0, 80)); d.accept(); });
  await page.addInitScript(() => { localStorage.setItem('user_type', '3'); localStorage.setItem('user_id', 'u1'); localStorage.setItem('user_name', '김영양'); localStorage.setItem('account_id', 'A1'); localStorage.setItem('account_name', '우리누리'); localStorage.setItem('planned-servings:A1', '50'); });
  let saved = null; const sent = []; const calls = [];
  await page.route('**/*', async r => {
    const req = r.request(); if (!['fetch', 'xhr'].includes(req.resourceType())) return r.continue();
    const u = new URL(req.url()); const p = u.pathname; let body = []; let status = 200;
    const json = () => { try { return JSON.parse(req.postData() || '{}') } catch { return {} } };
    calls.push(req.method() + ' ' + p);
    if (p.endsWith('/User/Session')) body = { userType: '3', userId: 'u1', accountId: 'A1' };
    else if (p.endsWith('/Account/AccountList')) body = [{ account_id: 'A1', account_name: '우리누리' }];
    else if (p.endsWith('/Account/MealSlotList')) body = [{ meal_slot_code: 2, meal_slot_name: '중식', display_order: 1, selected_yn: 'Y' }];
    else if (p.endsWith('/Account/MealConfiguration')) body = { account_id: 'A1', account_type: 1, account_type_name: '요양원', price_source: 'OVERRIDE', main_meal_count: 1, profiles: [{ meal_slot_code: 2, default_food_type: 1, default_meal_plan_type: 0, budget_per_person: 6000 }] };
    else if (p.endsWith('/Menu/AccountMenuList') || p.endsWith('/Menu/MenuList')) body = menus;
    else if (p.endsWith('/v2/meal-plans')) body = saved ? [saved] : [];
    else if (p.endsWith('/v2/meal-plans/save')) { const j = json(); saved = { table_id: j.table_id, account_id: 'A1', table_name: j.table_name, table_year: j.table_year, table_month: j.table_month, table_week: j.table_week, source: j.source, meal_plan_type: j.meal_plan_type }; body = { id: 1 }; }
    else if (p.endsWith('/v2/meal-plans/usage-week')) body = { meals: [] };
    else if (p.endsWith('/v2/meal-plans/impact')) body = { affected_orders: [], completed_meals: 0, changes: [] };
    else if (p.endsWith('/v2/meal-plans/services')) { const d = kst(); d.setUTCDate(d.getUTCDate() + 2); body = [{ meal_date: ymd(d) }]; }
    else if (p.endsWith('/Procurement/Shortages')) body = shortage(req.method() === 'POST' ? json() : Object.fromEntries(u.searchParams));
    else if (p.endsWith('/Procurement/Preview')) { const j = json(); const res = shortage(j.criteria || {}); const items = (j.items || j.selections || []).map(s => { const row = res.ingredients.find(r => r.offers[0].supplier_offer_id === s.supplier_offer_id) || res.ingredients[0]; const o = row.offers[0]; const { offers, ...rest } = row; return { ...rest, offer: o, order_qty: s.order_qty, ordered_base_qty: s.order_qty * 1000, item_amount: s.order_qty * o.purchase_price, supply_amount: null, vat_amount: null, tax_type: o.tax_type } }); body = { criteria: j.criteria || res.criteria, items, item_amount: items.reduce((a, i) => a + i.item_amount, 0) }; }
    else if (p.endsWith('/Procurement/OrdersBatch')) { const j = json(); sent.push(j); body = { request_key: j.request_key, orders: [{ supplier_code: 'WELSTORY', supplier_name: '웰스토리', external_site_code: 'A0199240', delivery_date: '2026-10-18', purchase_order_id: 'PO1', status: 'ORDERED' }, { supplier_code: 'OURHOME', supplier_name: '아워홈', external_site_code: 'FU0UR', delivery_date: '2026-10-18', purchase_order_id: 'PO2', status: 'ORDERED' }] }; }
    else if (p.endsWith('/v2/supplier-integration/sites')) body = [{ supplier_account_site_id: 1, supplier_code: 'WELSTORY', supplier_name: '웰스토리', external_site_code: 'A0199240', external_site_name: '우리누리' }, { supplier_account_site_id: 2, supplier_code: 'OURHOME', supplier_name: '아워홈', external_site_code: 'FU0UR', external_site_name: '우리누리' }];
    else if (p.endsWith('/v2/workspace/tasks')) body = { accounts: [{ account_id: 'A1', account_name: '우리누리', pending_orders: 0, due_receipts: 0, pending_meals: 0, supplier_notices: 0, mapped_suppliers: 2 }] };
    else if (p.endsWith('/v2/workspace/calendar')) body = { days: [] };
    else if (p.endsWith('/v2/workspace/account-summary')) body = { account_id: 'A1', month: '2026-10', account_name: '우리누리', user_name: '김영양', manager_name: null, manager_tel: null, budget: { status: 'NONE' } };
    else if (p.endsWith('/v2/workspace/notifications') || p.endsWith('/v2/workspace/notifications/refresh')) body = [];
    else if (p.endsWith('/Procurement/DeadlineAlerts')) body = { alerts: [] };
    else if (p.endsWith('/v2/supplier-integration/preparation')) body = { suppliers: [] };
    return r.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  });

  let clicks = 0;
  const click = async (locator, label) => { await locator.first().waitFor({ timeout: 15000 }); await locator.first().click(); clicks++; console.log(`  ${name} click ${clicks}: ${label}`); await page.waitForTimeout(1200); };
  try {
    await page.goto(BASE + '/home'); await page.waitForTimeout(2500);
    await steps(page, click);
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${out}/flow-${name}.png` });
  } finally { await b.close(); }
  const ok = clicks <= limit && sent.length === 1 && (sent[0].items || []).length > 0 && !errors.length;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}: 클릭 ${clicks}번(한도 ${limit}) · 보낸 품목 ${(sent[0]?.items || []).length} · 오류 ${JSON.stringify(errors)}`);
  return ok;
}

(async () => {
  const results = [
    await run('new-week', 5, async (page, click) => {
      await click(page.locator('.side-layout__sublink', { hasText: '식단표 관리' }), "사이드 운영관리 > 식단표 관리");
      await click(page.getByRole('button', { name: '자동 식단표 제작' }), '자동 식단표 제작');
      await page.waitForTimeout(1500);
      await click(page.getByRole('button', { name: /저장하고 발주하기/ }).last(), '저장하고 발주하기');
      await page.waitForTimeout(2500);
      await click(page.getByRole('button', { name: /품목 발주서 확인/ }), '발주서 확인');
      await click(page.getByRole('button', { name: /곳에 발주 보내기/ }), '발주 보내기');
    }),
    await run('plan-exists', 3, async (page, click) => {
      await click(page.locator('.rd-step', { hasText: '재고 부족' }).getByRole('link', { name: '발주하기' }), "홈 '오늘 할 일' 발주하기");
      await page.waitForTimeout(2000);
      await click(page.getByRole('button', { name: /품목 발주서 확인/ }), '발주서 확인');
      await click(page.getByRole('button', { name: /곳에 발주 보내기/ }), '발주 보내기');
    }),
  ];
  process.exit(results.every(Boolean) ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
