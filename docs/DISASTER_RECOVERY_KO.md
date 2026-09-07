# VeInvite 재해 복구 / 백업 운영서

기준일: 2026-09-07

## 목적

VeInvite는 초대 관계, 미션 온체인 증거, 보상 상태, Sybil 판정/관찰 자료, 운영 감사 기록을 Production PostgreSQL에 보존한다. 이 문서는 DB 손상, 잘못된 migration, 운영 실수, 프로젝트 장애가 발생했을 때 데이터 손실을 최소화하고 안전하게 복구하기 위한 최소 절차다.

## 현재 가장 중요한 사실

- Production Supabase 조직은 2026-09-07 점검 시 **Free 플랜**이었다.
- Supabase 공식 백업 문서는 자동 일일 백업을 Pro/Team/Enterprise 프로젝트에 제공한다고 명시하고, Free 프로젝트에는 정기적인 `db dump`와 외부 보관을 권장한다.
- 따라서 **Dashboard에 복구 가능한 백업이 있을 것이라고 가정하면 안 된다.**
- Git migration은 스키마를 재구성할 수 있지만 실제 사용자/보상/감사 데이터의 백업은 아니다.
- Production 데이터 dump를 Git 저장소에 commit하지 않는다.

## 초기 복구 목표

현재 규모에서의 운영 목표이며 보장값이 아니다.

- RPO 목표: 최대 24시간 이내의 사용자 데이터 손실
- RTO 목표: 장애 인지 후 4시간 이내 서비스 복구 판단/실행
- Production 데이터가 증가하거나 첫 실제 B3TR 지급이 발생하면 더 짧은 RPO 또는 유료 백업/PITR 도입을 재검토한다.

## 보존 우선순위

### Tier 0 — 절대 보존

- `invitations`
- `referral_links`
- `referral_relationships`
- `eligibility_check_events`
- `invite_impact_events`
- `veinvite_event_ledger`
- `invitation_lifecycle_audit_log`
- `reward_queue_entries`
- `reward_rounds`
- `reward_payouts`
- `reward_payout_manifests`
- `reward_receipts` / reward settlement 계열
- `reward_runtime_config`
- `sybil_review_events`
- `sybil_onchain_snapshots`
- `reward_recipient_b3tr_flow_snapshots`
- migration/schema metadata

### Tier 1 — 가능하면 함께 보존

- operator monitoring / reporting snapshots
- reward forecast/allocation accounting 자료
- analytics 장기 rollup 및 archive lifecycle 자료
- 국가/언어 등 운영 분석 자료

### Tier 2 — 재생성/만료 가능

- wallet auth challenges
- 만료 wallet auth sessions
- rate-limit buckets
- 재생성 가능한 fast projection/cache 성격의 데이터

전체 logical dump는 Tier를 따로 골라 백업하지 않고 DB 전체를 저장한다. Tier는 복구 후 검증 우선순위를 정하기 위한 분류다.

## 백업 생성

저장소의 `scripts/backup-production-db.sh`를 사용한다.

필요 사항:

- PostgreSQL client (`pg_dump`, `pg_restore`)
- Production DB 접속 정보
- Git 저장소 **밖**의 암호화된 백업 디렉터리

필수 환경변수:

- `PGHOST`
- `PGUSER`
- `PGPASSWORD`
- `PGDATABASE`
- `BACKUP_OUTPUT_DIR`

스크립트 안전장치:

- `umask 077`
- Git 저장소 내부 백업 거부
- custom-format dump
- `pg_restore --list`로 구조 검증 후에만 성공 파일로 승격
- SHA-256 checksum 생성
- 접속 비밀번호를 백업 metadata에 기록하지 않음

### 권장 주기

1. Production 데이터가 변하는 날: 최소 하루 1회
2. 중요 migration/대량 정리 작업 전: 즉시 1회
3. 첫 실제 reward payout 전후: 즉시 1회
4. 운영자 수동 보상/복구 작업 전: 즉시 1회

백업 파일은 같은 노트북/같은 Supabase 프로젝트 안에만 두지 말고 암호화된 별도 위치에 복제한다.

## 백업 성공 조건

파일이 존재하는 것만으로는 성공이 아니다.

아래가 모두 충족되어야 성공으로 본다.

1. dump 명령 성공
2. `pg_restore --list` 성공
3. SHA-256 sidecar 생성
4. 외부 보관 위치 복제 완료
5. 최근 복원훈련 날짜가 기록되어 있음

## 복원 훈련

Production에 직접 복원 테스트하지 않는다.

`scripts/restore-db-drill.sh`는 기본 실행 시 archive를 읽어볼 수 있는지만 검사하며 데이터베이스를 변경하지 않는다.

실제 훈련 복원은 아래 조건을 모두 만족해야 한다.

- disposable/non-production DB 사용
- `--execute` 명시
- `ALLOW_NONPRODUCTION_RESTORE=YES` 명시
- Production DB hostname이 아닌지 확인

스크립트는 알려진 VeInvite Production DB host에 대한 restore를 거부한다.

### 복원 후 검증 순서

1. migration/schema가 예상 버전인지 확인
2. Tier 0 테이블 존재/row count 확인
3. 초대 무결성 확인
   - 자기 추천 0
   - child wallet 중복 0
   - source invitation 중복 0
4. immutable event/audit ledger가 존재하는지 확인
5. reward 상태 검증
   - PAID인데 tx/paid_at 없는 행 0
   - queue orphan 0
   - 음수/0 이하 지급 금액 없음
6. Sybil observation/review 자료 존재 확인
7. RLS, trigger, service-role-only view/function 권한 확인
8. 앱을 non-production 환경에 연결해 health/auth/invite read를 확인
9. 실제 지급은 수행하지 않는다.

## 실제 장애 발생 시

### 1. 쓰기 중지 판단

아래 상황이면 reward/admin mutation을 우선 중지한다.

- 잘못된 reward 지급 가능성
- invitation/reward evidence 손상
- migration 중간 실패 후 schema 정합성 불명확
- service role / signer credential 노출 의심

필요하면 기존 emergency reward pause 절차를 사용한다.

### 2. 복구 지점 결정

가능하면 다음 순서로 선택한다.

1. Supabase가 제공하는 공식 restore point가 실제로 존재하는지 확인
2. 없다면 가장 최근 검증된 off-site logical dump 선택
3. dump 이후 발생한 온체인 사실은 VeChain 및 immutable tx evidence로 재대조

### 3. 복구 후 자동 지급 금지

복구 직후 reward 자동화를 곧바로 재개하지 않는다. 먼저 queue/payout/receipt/settlement와 on-chain tx를 대조한 뒤 재개한다.

## 절대 하지 말 것

- Production dump를 GitHub에 commit
- dump를 평문 public cloud folder에 저장
- 실제 Production에 `restore-db-drill.sh --execute` 실행
- 최신 백업이 있다는 추측만으로 destructive migration 실행
- 복구 후 payout ledger와 chain을 비교하지 않고 reward automation 재개
- 오래된 session/rate-limit 데이터를 Tier 0 데이터보다 우선 복구

## 향후 업그레이드 조건

다음 중 하나가 충족되면 Supabase 유료 자동 백업 또는 PITR을 재검토한다.

- 첫 실제 B3TR 자동 지급 발생
- 보상 규모가 운영상 의미 있는 금액으로 증가
- 하루 신규/복귀 참여자 수가 크게 증가
- 24시간 RPO가 수용 불가능해짐
- 운영자가 수동 logical backup을 안정적으로 유지하기 어려워짐

PITR/유료 플랜 비용은 도입 시점의 최신 Supabase 가격과 요구 compute 조건을 다시 확인한다.

## 정기 복구 점검 체크리스트

- [ ] 최근 24시간 내 검증된 backup 존재
- [ ] checksum 존재
- [ ] 외부 암호화 위치에 복제됨
- [ ] 최근 30일 내 non-production restore drill 완료
- [ ] Production migration baseline과 Git CI가 정상
- [ ] reward queue/payout integrity 정상
- [ ] event ledger 증가 정상
- [ ] emergency pause 절차 접근 가능
- [ ] operator/signing credentials가 backup 파일에 포함되지 않음
