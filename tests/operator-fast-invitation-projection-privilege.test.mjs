import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = await readFile(
  new URL('../supabase/migrations/20260903172000_restore_fast_invitation_projection_service_role_execute.sql', import.meta.url),
  'utf8',
);

test('fast invitation trigger helper remains service-role-only and executable', () => {
  assert.match(
    migration,
    /grant execute on function public\.sync_operator_fast_invitation_projection\(uuid\)[\s\S]*to service_role/iu,
  );
  assert.doesNotMatch(migration, /to\s+(?:public|anon|authenticated)\b/iu);
  assert.doesNotMatch(migration, /security\s+definer/iu);
});
