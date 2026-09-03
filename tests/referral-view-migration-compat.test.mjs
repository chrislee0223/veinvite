import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [dropMigration, sponsorPlacementMigration] = await Promise.all([
  readFile(
    new URL(
      '../supabase/migrations/20260903162500_drop_legacy_referral_network_edges_view.sql',
      import.meta.url,
    ),
    'utf8',
  ),
  readFile(
    new URL(
      '../supabase/migrations/20260903163000_separate_sponsor_and_network_placement.sql',
      import.meta.url,
    ),
    'utf8',
  ),
]);

test('legacy graph view is explicitly dropped before output columns are renamed', () => {
  assert.match(
    dropMigration,
    /drop view if exists public\.qualified_referral_network_edges;/i,
  );
  assert.doesNotMatch(dropMigration, /cascade/i);
  assert.match(
    sponsorPlacementMigration,
    /create or replace view public\.qualified_referral_network_edges/i,
  );
  assert.match(
    sponsorPlacementMigration,
    /q\.parent_wallet as sponsor_wallet/i,
  );
  assert.match(
    sponsorPlacementMigration,
    /a\.placement_parent_wallet/i,
  );
});
