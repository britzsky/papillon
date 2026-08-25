$ErrorActionPreference = 'Stop'

$accountId = '20250819193455'
$frontDir = 'C:\Users\papillon\docs\db\meal-configuration'
$backDir = 'C:\Users\손경원\eclipse-workspace\the-full-order-api\scripts\meal-configuration'
$inputs = @(
    @('C:\Users\손경원\Desktop\발주DB\order_insert_local.txt', 'order_insert_local_200_account_20250819193455.sql'),
    @('C:\Users\손경원\Desktop\발주DB\the_full_order_seed_testdata_fixed_utf8mb4_real.sql', 'the_full_order_seed_testdata_200_account_20250819193455.sql')
)

$menu100 = "(97,'프리미엄잡채',5,390,1,9),(98,'프리미엄훈제오리샐러드',5,410,0,11),(99,'프리미엄과일플래터',5,210,2,13),(100,'프리미엄수제티라미수',5,380,2,13);"
$menu200 = $menu100 + @'


/* 기존 100개를 기반으로 식사분류가 다양한 메뉴 101~200을 추가한다. */
DROP TEMPORARY TABLE IF EXISTS tmp_seed_menu_base;
CREATE TEMPORARY TABLE tmp_seed_menu_base AS
SELECT * FROM tmp_seed_menu WHERE menu_no BETWEEN 1 AND 100;

INSERT INTO tmp_seed_menu
(menu_no,menu_name,meal_plan_type,calories_per_serving,menu_type,menu_gubun,food_type)
SELECT menu_no+100,CONCAT(menu_name,' 2'),meal_plan_type,calories_per_serving,menu_type,menu_gubun,MOD(menu_no-1,6)+1
FROM tmp_seed_menu_base;

DROP TEMPORARY TABLE tmp_seed_menu_base;
'@

$cleanup = @'
DELETE FROM tb_account_meal_schedule_override WHERE account_id='20250819193455';
DELETE FROM tb_account_meal_slot_profile WHERE account_id='20250819193455';
DELETE FROM tb_account_meal_slot_setting WHERE account_id='20250819193455';
DELETE FROM tb_meal_composition_template WHERE account_id='20250819193455';
'@

$configuration = @'


/* 고객사 자동 식단 기본 구성: 조식·중식·오후간식·석식을 사용한다. */
INSERT INTO tb_account_meal_slot_setting(account_id,meal_slot_code,display_order,user_id) VALUES
('20250819193455',0,1,'SEED'),('20250819193455',2,2,'SEED'),('20250819193455',3,3,'SEED'),('20250819193455',5,4,'SEED');

INSERT INTO tb_meal_composition_template(account_id,template_name,food_type,meal_plan_type,user_id)
VALUES ('20250819193455','한식 기본 4찬',1,0,'SEED');
SET @seed_template_id=LAST_INSERT_ID();

INSERT INTO tb_meal_composition_template_item(template_id,component_name,menu_type,required_count,required_yn,sort_order,user_id) VALUES
(@seed_template_id,'밥',0,1,'Y',1,'SEED'),(@seed_template_id,'국',1,1,'Y',2,'SEED'),
(@seed_template_id,'주찬',0,1,'Y',3,'SEED'),(@seed_template_id,'부찬',1,2,'Y',4,'SEED');
SET @seed_rice_item=(SELECT template_item_id FROM tb_meal_composition_template_item WHERE template_id=@seed_template_id AND sort_order=1);
SET @seed_soup_item=(SELECT template_item_id FROM tb_meal_composition_template_item WHERE template_id=@seed_template_id AND sort_order=2);
SET @seed_main_item=(SELECT template_item_id FROM tb_meal_composition_template_item WHERE template_id=@seed_template_id AND sort_order=3);
SET @seed_side_item=(SELECT template_item_id FROM tb_meal_composition_template_item WHERE template_id=@seed_template_id AND sort_order=4);
INSERT INTO tb_meal_composition_item_gubun(template_item_id,menu_gubun,priority) VALUES
(@seed_rice_item,0,1),(@seed_soup_item,1,1),
(@seed_main_item,3,1),(@seed_main_item,4,2),(@seed_main_item,5,3),(@seed_main_item,8,4),(@seed_main_item,9,5),
(@seed_side_item,2,1),(@seed_side_item,6,2),(@seed_side_item,10,3),(@seed_side_item,11,4),(@seed_side_item,14,5),(@seed_side_item,17,6);

INSERT INTO tb_account_meal_slot_profile(account_id,meal_slot_code,default_food_type,default_meal_plan_type,template_id,user_id) VALUES
('20250819193455',0,1,0,@seed_template_id,'SEED'),('20250819193455',2,1,0,@seed_template_id,'SEED'),
('20250819193455',3,6,0,NULL,'SEED'),('20250819193455',5,1,0,@seed_template_id,'SEED');
'@

$serviceReplacement = @'
INSERT INTO tb_account_meal_service
(table_id,account_id,meal_date,weekday,meal_slot,meal_slot_code,food_type,meal_plan_type,template_id,planned_servings,actual_servings,meal_budget_per_person,budget_source,budget_source_amount,budget_divisor,status,user_id)
SELECT CONCAT('TBL-TEST-',t.meal_plan_type),'20250819193455',DATE_SUB(CURRENT_DATE,INTERVAL t.meal_plan_type DAY),'화','2',2,1,t.meal_plan_type,p.template_id,
       100,NULL,b.budget_per_person,b.budget_source,b.budget_source_amount,b.budget_divisor,'CONFIRMED','SEED'
FROM (SELECT DISTINCT meal_plan_type FROM tmp_seed_menu) t
JOIN vw_account_meal_slot_budget b ON b.account_id='20250819193455' AND b.meal_slot_code=2
LEFT JOIN tb_account_meal_slot_profile p ON p.account_id=b.account_id AND p.meal_slot_code=b.meal_slot_code;
'@

foreach ($pair in $inputs) {
    $text = Get-Content -Encoding UTF8 -LiteralPath $pair[0] -Raw
    $text = $text.Replace('TEST_ACCOUNT_001', $accountId)
    $text = $text.Replace('메뉴 100개', '메뉴 200개')
    $text = $text.Replace('100개 메뉴 테스트 데이터', '200개 메뉴 테스트 데이터')
    $text = $text.Replace('/* 공통 메뉴 100개 */', '/* 공통 메뉴 200개 */')
    $text = $text.Replace('    menu_gubun INT NOT NULL', "    menu_gubun INT NOT NULL,`r`n    food_type TINYINT NOT NULL DEFAULT 1")
    $text = $text.Replace($menu100, $menu200)
    $text = $text.Replace('/* 기존 테스트 데이터 정리 */', "/* 기존 테스트 데이터 정리 */`r`n$cleanup")
    $marker = "DELETE FROM tb_ingredient_master WHERE ingredient_id LIKE 'TIG%';"
    $text = $text.Replace($marker, "$marker$configuration")
    $text = $text.Replace("SELECT CONCAT('TMENU',LPAD(menu_no,3,'0')),menu_no,menu_name,menu_name,1,'테스트 데이터'", "SELECT CONCAT('TMENU',LPAD(menu_no,3,'0')),menu_no,menu_name,menu_name,food_type,'테스트 데이터'")
    $text = $text.Replace("SELECT '$accountId',CONCAT('TMENU',LPAD(menu_no,3,'0')),menu_name,menu_name,1,'테스트 데이터'", "SELECT '$accountId',CONCAT('TMENU',LPAD(menu_no,3,'0')),menu_name,menu_name,food_type,'테스트 데이터'")
    $text = $text.Replace("CONCAT('TMENU',LPAD(m.menu_no,3,'0')),m.menu_name,1,m.menu_type", "CONCAT('TMENU',LPAD(m.menu_no,3,'0')),m.menu_name,m.food_type,m.menu_type")
    $text = $text.Replace('(table_id,account_id,account_name,table_name,table_year,table_month,table_week,source,meal_plan_type,status,user_id)', '(table_id,account_id,account_name,table_name,table_year,table_month,table_week,meal_plan_type,status,user_id)')
    $text = $text.Replace("YEAR(CURRENT_DATE),MONTH(CURRENT_DATE),1,'AUTO',meal_plan_type,'CONFIRMED','SEED'", "YEAR(CURRENT_DATE),MONTH(CURRENT_DATE),1,meal_plan_type,'CONFIRMED','SEED'")
    $servicePattern = '(?s)INSERT INTO tb_account_meal_service\s*\(table_id,account_id,meal_date,weekday,meal_slot,planned_servings,actual_servings,meal_budget_per_person,status,user_id\)\s*SELECT.*?FROM \(SELECT DISTINCT meal_plan_type FROM tmp_seed_menu\) t;'
    $text = [regex]::Replace($text, $servicePattern, $serviceReplacement)
    $frontPath = Join-Path $frontDir $pair[1]
    Set-Content -Encoding UTF8 -LiteralPath $frontPath -Value $text
    Copy-Item -LiteralPath $frontPath -Destination $backDir -Force
}


