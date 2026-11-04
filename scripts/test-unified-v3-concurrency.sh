#!/usr/bin/env bash
# Isolated-only concurrent finalization race test. Requires the existing
# workflow's postgres:16 sandbox and v3 writer fixtures. NO production data.
set -euo pipefail
tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"' EXIT

sql="select reward_unified_v3.sandbox_commit_round_v1(
'testnet',
'0x29acc8863cf2ab7a82d16c62d61ca84b6650cede4c4fd69073148c875349021e',
128,110,525000000000000000000,25000000000000000000,
500000000000000000000
);"
psql -v ON_ERROR_STOP=1 -c "$sql" >"$tmpdir/a.out" 2>"$tmpdir/a.err" &
a=$!
psql -v ON_ERROR_STOP=1 -c "$sql" >"$tmpdir/b.out" 2>"$tmpdir/b.err" &
b=$!

pass=0
fail=0
if wait "$a"; then pass=$((pass+1)); else fail=$((fail+1)); fi
if wait "$b"; then pass=$((pass+1)); else fail=$((fail+1)); fi
if [[ "$pass" -ne 1 || "$fail" -ne 1 ]]; then
  echo "CONCURRENT_V3_ROUND_INCONSISTENT: $pass successes/$fail failures" >&2
  cat "$tmpdir/a.err" "$tmpdir/b.err" >&2
  exit 1
fi
if ! grep -Eq 'UNIFIED_V3_ROUND_NOT_NEXT|duplicate key value violates unique constraint' "$tmpdir/a.err" "$tmpdir/b.err"; then
  echo 'CONCURRENT_V3_UNEXPECTED_FAILURE_REASON' >&2
  cat "$tmpdir/a.err" "$tmpdir/b.err" >&2
  exit 1
fi
count="$(psql -v ON_ERROR_STOP=1 -At -c "select count(*) from reward_unified_v3.settlements where network='testnet' and vebetter_round_id=128")"
if [[ "$count" != 1 ]]; then
  echo "CONCURRENT_V3_ROUND_DOUBLE_COMMITTED: $count" >&2
  exit 1
fi
liability="$(psql -v ON_ERROR_STOP=1 -At -c "select reward_unified_v3.read_outstanding_wei_v1('testnet','0x29acc8863cf2ab7a82d16c62d61ca84b6650cede4c4fd69073148c875349021e')")"
if [[ "$liability" != 500000000000000000000 ]]; then
  echo "CONCURRENT_V3_LIABILITY_CHANGED: $liability" >&2
  exit 1
fi
echo 'UNIFIED_V3_CONCURRENT_WRITER_TEST_PASSED'
