# 실시간 품목 조회 백엔드 연동 계약

프런트엔드는 `POST /Order/ItemLookup`을 호출합니다. 백엔드는 인증 토큰과 제휴사 API 주소를 서버 환경변수로 관리하고, 웰스토리의 `POST /fdapi/service/payer-realtime-item`으로 요청을 전달해야 합니다.

요청 헤더:

```http
Content-Type: application/json
guid: yyyyMMddHHmmssSSS + 2자리 순번
```

요청 본문:

```json
{
  "dataHeader": {
    "soldTo": "사업장코드(필수, 최대 10자리)",
    "itemCode": "품목코드(필수, 최대 18자리)",
    "reqDeliveryDate": "YYYYMMDD(필수)"
  },
  "dataBody": {}
}
```

백엔드는 웰스토리의 JSON 응답과 HTTP 상태를 유지해 전달합니다. 액세스 토큰은 브라우저로 내려보내지 않으며, 서버 로그에는 토큰과 전체 요청 헤더를 기록하지 않습니다. 외부 통신 실패는 적절한 5xx 상태와 사용자에게 노출 가능한 오류 메시지로 변환합니다.

프런트엔드는 `dataBody.resCd === "S0000"`을 성공으로 처리하며, `dataBody.data`가 단일 객체 또는 배열인 경우를 모두 지원합니다.
