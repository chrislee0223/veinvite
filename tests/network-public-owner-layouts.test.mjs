import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [
  migration,
  runtime,
  privateRoute,
  publicRoute,
  publishRoute,
  appNetwork,
  publicExplorer,
  publicOwnerLayoutView,
  publicOwnerGroups,
] = await Promise.all([
  readFile(
    'supabase/migrations/20261001103444_add_public_network_owner_layout_foundation.sql',
    'utf8',
  ),
  readFile('src/lib/networkRuntimeServer.ts','utf8'),
  readFile('src/app/api/network/route.ts','utf8'),
  readFile('src/app/api/network/public/route.ts','utf8'),
  readFile('src/app/api/network/layout/route.ts','utf8'),
  readFile('src/components/AppNetwork.tsx','utf8'),
  readFile('src/components/PublicNetworkExplorer.tsx','utf8'),
  readFile('src/lib/networkPublicOwnerLayoutView.ts','utf8'),
  readFile('src/components/PublicNetworkOwnerGroups.tsx','utf8'),
]);

test('published Network layouts default OFF and are never browser-direct tables', () => {
  assert.match(migration,/public_layout_mode text not null default 'off'/u);
  assert.match(migration,/public_layout_mode in \('off','canary','on'\)/u);
  assert.match(migration,/alter table public\.network_public_layouts enable row level security/u);
  assert.match(migration,/revoke all on public\.network_public_layouts[\s\S]*from public, anon, authenticated/u);
  assert.match(migration,/grant select, insert, update, delete[\s\S]*to service_role/u);
  assert.match(runtime,/canUseNetworkPublicLayout/u);
});

test('layout publish is owner-authenticated, graph-validated and revision guarded', () => {
  assert.match(publishRoute,/requireWalletSession\([\s\S]*expectedWallet: rootWallet/u);
  assert.match(publishRoute,/x-veinvite-layout-intent/u);
  assert.match(publishRoute,/read_referral_network_focus_v2/u);
  assert.match(publishRoute,/buildNetworkCanaryFixture/u);
  assert.match(publishRoute,/expectedRevision/u);
  assert.match(publishRoute,/LAYOUT_REVISION_CONFLICT/u);
  assert.match(publishRoute,/MAX_BODY_BYTES/u);
  assert.match(publishRoute,/network_layout_publish_wallet/u);
});

test('layout metadata is optional and cannot take the graph down', () => {
  assert.match(privateRoute,/Failed to read published Network layout/u);
  assert.match(privateRoute,/return \{[\s\S]*\.\.\.payload,[\s\S]*publicLayoutPublishingEnabled: true/u);
  assert.match(publicRoute,/Layout is optional display metadata/u);
  assert.match(publicRoute,/Failed to load public Network owner layout/u);
});

test('legacy local workspaces are not auto-published on hydration', () => {
  assert.match(appNetwork,/networkWorkspaceIsEmpty\(localWorkspace\)/u);
  assert.match(appNetwork,/localRevision > 0[\s\S]*snapshot\.revision > localRevision/u);
  assert.match(appNetwork,/queuePublishedWorkspace\(workspace\)/u);
  assert.doesNotMatch(
    appNetwork,
    /readStoredWorkspace\(wallet\)[\s\S]{0,500}publishNetworkLayout/u,
  );
});

test('published focus snapshots materialize all current child and slot positions', () => {
  assert.match(appNetwork,/materializeNetworkWorkspaceForPublish/u);
  assert.match(appNetwork,/currentData\.children\.map/u);
  assert.match(appNetwork,/inviteSlots\.map/u);
  assert.match(appNetwork,/publicLayoutPublishingEnabled !==[\s\S]*true/u);
});

test('Public Network reuses workspace grouping read-only and keeps viewer changes ephemeral', () => {
  assert.match(publicOwnerLayoutView,/deriveNetworkWorkspaceVisibility/u);
  assert.match(publicOwnerLayoutView,/ownerLayoutActive[\s\S]*false[\s\S]*isMobile/u);
  assert.match(publicExplorer,/workspaceOverrides/u);
  assert.match(publicExplorer,/toggleWorkspaceGroupCollapsed/u);
  assert.match(publicOwnerGroups,/publicGroupNode/u);
  assert.doesNotMatch(publicExplorer,/localStorage\.setItem/u);
  assert.doesNotMatch(publicExplorer,/\/api\/network\/layout/u);
});
