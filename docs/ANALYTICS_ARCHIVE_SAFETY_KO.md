# VeInvite Analytics Archive / Purge 안전 운영 기준

## 현재 상태

현재 Production 운영 원칙은 **Archive 저장소 및 destructive cleanup 비활성화**입니다.

- 일일 analytics maintenance cron은 장기 rollup을 갱신하고 Health를 점검하지만 raw analytics를 삭제하지 않습니다.
- `compact_app_usage_analytics` / `compact_app_product_analytics` 함수가 DB에 존재한다는 사실은 자동삭제가 활성화되어 있다는 뜻이 아닙니다.
- 실제 Archive object 저장, checksum 재검증, restore 검증이 준비되기 전에는 destructive cleanup을 호출하지 않습니다.
- 더 강하게, 현재는 `service_role`의 두 compaction 함수 EXECUTE 권한 자체를 제거해 **DB 권한 계층에서도 destructive cleanup을 비활성화**합니다. postgres owner만 보유하며 실제 Archive가 준비된 뒤 별도 reviewed migration으로만 다시 활성화합니다.

## Raw 삭제 전 필수 조건

한 날짜의 raw analytics는 다음 조건을 모두 만족하기 전에는 삭제하면 안 됩니다.

1. 서울 시간 기준 완료된 날짜이며 활성 보관기간(현재 365일)을 지났을 것
2. 해당 dataset/date의 one-day Archive Manifest가 존재할 것
3. Archive lifecycle이 정상 순서로 진행되었을 것
4. checksum 검증과 source row-count 검증이 완료되어 `VERIFIED`일 것
5. 관리자/QA 제외 규칙이 적용된 동일한 source-filter semantics를 사용할 것
6. Usage와 Product/Funnel 간 의존 순서가 깨지지 않을 것
7. 실제 physical delete와 `HOT_SOURCE_PURGED` 기록이 같은 DB transaction 안에서 완료될 것
8. 실제 Archive storage/restore 검증 완료 후 별도 migration으로 destructive cleanup 실행권한을 명시적으로 재활성화했을 것

조건 중 하나라도 충족되지 않으면 cleanup은 fail-closed 해야 합니다.

## HOT_SOURCE_PURGED 영구 원장

실제 raw가 삭제되면 `veinvite_analytics_hot_source_purge_ledger`에 dataset/date별 영구 기록을 남깁니다.

이 원장은 다음 목적을 가집니다.

- raw가 이미 사라진 오래된 날짜도 Health가 계속 추적
- 당시 Archive row count와 실제 삭제 row count 보존
- 같은 dataset/date의 중복 purge 방지
- purge 이후 영구 rollup이 조용히 다시 계산·수정·삭제되는 것을 차단
- Archive가 나중에 REVOKED/손상되어도 위험 상태를 다시 감지

원장은 append-only이며 service_role은 직접 INSERT/UPDATE/DELETE할 수 없습니다.

## Purge 이후 영구 봉인

한 날짜가 실제 purge되면 다음 장기 집계는 해당 날짜에 대해 봉인됩니다.

- `app_usage_daily_rollups`
- `app_usage_daily_dimension_rollups`
- `app_usage_daily_view_counts`
- `app_product_event_daily_rollups`
- `app_product_event_daily_dimension_rollups`
- `veinvite_daily_funnel_rollups`

봉인된 날짜는 INSERT/UPDATE/DELETE로 조용히 바꿀 수 없습니다. 역사적 정정이 필요하면 별도 버전/보정 기록을 설계해야 하며 기존 값을 몰래 덮어쓰면 안 됩니다.

## Raw 재삽입 금지

이미 purge된 dataset/date에 raw row가 다시 들어오면 과거 Archive와 영구 rollup의 의미가 깨질 수 있으므로 DB가 거부합니다.

- Product event: purge된 `usage_date` INSERT 차단
- Usage session: purge된 서울 날짜로 INSERT/UPDATE 차단

정상 사용자 수집은 현재 날짜를 대상으로 하므로 365일 이상 지난 purge 날짜 재삽입은 정상 트래픽으로 간주하지 않습니다.

## Archive 손상 후 복구

Purge가 끝난 뒤 기존 Archive가 손상되어 `REVOKED`되면 Health는 해당 날짜를 다시 위험으로 표시해야 합니다.

복구는 기존 raw를 되살리는 방식이 아니라 **새 Archive copy/manifest**를 만드는 방식으로 합니다.

새 Archive는:

- 동일 dataset/date
- purge ledger에 영구 기록된 원래 archived row count와 동일한 `source_row_count`
- checksum 검증 완료
- source-row-count 검증 완료
- 정상 lifecycle을 거쳐 `VERIFIED`

조건을 만족해야 다시 유효한 Archive로 인정합니다.

## 권한 원칙

`HOT_SOURCE_PURGED`는 일반 Archive worker가 임의로 만들 수 없습니다.

- service_role의 `veinvite_archive_manifest_events` 직접 INSERT 권한 제거
- 정상 PREPARED / UPLOADED / VERIFIED / FAILED / REVOKED는 제한된 RPC 사용
- `HOT_SOURCE_PURGED`는 실제 bounded compaction transaction만 생성 가능
- 현재 compaction 함수는 **postgres-only**이며 service_role/anon/authenticated 실행권한 없음
- 실제 Archive 저장·restore 검증이 끝난 뒤에만 별도 migration으로 service execution을 재활성화
- anon / authenticated는 destructive cleanup 및 Archive lifecycle write 권한 없음

## Health에서 반드시 보는 값

장기 Analytics Health는 raw가 남아 있는 날짜뿐 아니라 purge ledger도 봐야 합니다.

특히:

- `purged_analytics_dates`
- `purged_analytics_dates_without_valid_archive`

두 값을 유지합니다.

`purged_analytics_dates_without_valid_archive > 0`이면 이미 hot raw가 없을 수 있으므로 높은 우선순위의 복구 문제로 취급해야 합니다.

## 아직 활성화하면 안 되는 것

다음이 준비되기 전까지 destructive cleanup을 자동화하거나 service_role에 실행권한을 주지 않습니다.

- 실제 Archive storage/export worker
- Dataset Schema Registry 및 canonical serialization
- object 존재 확인
- SHA-256 checksum 재계산/비교
- restore/re-read 검증
- 운영 alert 및 실패 복구 절차
- Production Supabase migration history 정식 repair

GitHub Issue #366이 해결되기 전에는 Production에 `supabase db push`를 사용하지 않습니다. migration history를 임의 SQL로 수정하지 않고 Supabase 공식 migration repair 절차로 정리합니다.

## 핵심 원칙

**Archive는 백업이 아니며, VERIFIED라는 DB 상태만으로 실제 보존이 증명되는 것도 아닙니다.**

실제 object를 저장하고 다시 읽어 checksum/건수/스키마를 검증한 뒤, 별도 reviewed migration으로 cleanup 권한까지 명시적으로 활성화한 후에만 destructive cleanup을 사용합니다.
