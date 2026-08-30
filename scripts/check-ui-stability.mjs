import {
  existsSync,
  readFileSync,
} from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const failures = [];

function read(path) {
  return readFileSync(join(root, path), 'utf8');
}

function requireFile(path) {
  if (!existsSync(join(root, path))) {
    failures.push(`Missing required UI asset: ${path}`);
  }
}

for (const code of [
  'us', 'kr', 'cn', 'in', 'es', 'jp',
  'it', 'tr', 'nl', 'de', 'fr',
]) {
  requireFile(`public/flags/${code}.svg`);
}

const pickerFiles = {
  'src/components/LanguageSelectV2.tsx': [
    /\.symbol\s*\{[^}]*background\s*:\s*#fff/i,
  ],
  'src/components/AppSettings.tsx': [
    /\.languageSymbol\s*,\s*\.languageOptionSymbol\s*\{[^}]*background\s*:\s*#fff/i,
  ],
  'src/components/HeaderLanguagePickerPortal.tsx': [
    /\.headerLanguageFlag\s*,\s*\.headerLanguageOptionFlag\s*\{[^}]*background\s*:\s*#fff/i,
  ],
};

for (const [path, forbiddenPatterns] of Object.entries(pickerFiles)) {
  const source = read(path);
  for (const pattern of forbiddenPatterns) {
    if (pattern.test(source)) {
      failures.push(`Artificial white flag background returned in ${path}`);
    }
  }
}

const inviteLanding = read('src/components/InviteLandingV2.tsx');
if (!/<select\s+className="languageSelect"/.test(inviteLanding)) {
  failures.push('Invite landing language control is not enhanced with app flags.');
}

const inviteeClient = read('src/components/InviteeClient.tsx');
if (!/className="languageSelect"/.test(inviteeClient)) {
  failures.push('Invitee language control is not enhanced with app flags.');
}
if (!/class InviteRequestError extends Error/.test(inviteeClient)) {
  failures.push('Invitee transient request errors are not distinguished from invalid links.');
}
if (!/console\.error\('Failed to claim invite:'/m.test(inviteeClient)) {
  failures.push('Invite claim flow can regress to an unhandled checking-state failure.');
}

const invitePage = read('src/app/i/[code]/page.tsx');
if (/InviteeReviewAutoRefresh/.test(invitePage)) {
  failures.push('Invite page has duplicate background polling alongside InviteeClient.');
}

const inviteProgressRoute = read('src/app/api/invites/[code]/route.ts');
if (!/INVITE_CODE_PATTERN/.test(inviteProgressRoute)) {
  failures.push('Public invite progress endpoint is missing early invite-code validation.');
}
if (!/scope:\s*'invite_progress_code'/.test(inviteProgressRoute)) {
  failures.push('Public invite progress endpoint is missing per-invite throttling.');
}
if (!/scope:\s*'invite_progress_ip'/.test(inviteProgressRoute)) {
  failures.push('Public invite progress endpoint is missing per-IP throttling.');
}

const homeRefresh = read('src/components/InviteStatusAutoRefresh.tsx');
if (!/POLL_INTERVAL_MS\s*=\s*30_000/.test(homeRefresh)) {
  failures.push('Home status polling should stay at the reviewed 30-second interval.');
}
if (!/EVIDENCE_SYNC_INTERVAL_MS\s*=\s*5 \* 60_000/.test(homeRefresh)) {
  failures.push('Inviter evidence reconciliation fallback is missing or unbounded.');
}

const walletSessionGate = read(
  'src/components/WalletSessionGate.tsx',
);
if (
  !/addEventListener\(\s*'wallet_disconnected'/.test(walletSessionGate) ||
  !/clearWalletSession\(\)/.test(walletSessionGate)
) {
  failures.push(
    'Wallet disconnect events must revoke the VeInvite server session instead of leaving a stale authentication cookie.',
  );
}

const uiSafety = read('src/app/ui-safety.css');
if (!/\.claimAction\s*\{[^}]*display\s*:\s*none\s*!important/i.test(uiSafety)) {
  failures.push('Legacy manual Claim UI safety rule is missing.');
}

if (failures.length > 0) {
  console.error('UI stability gate failed:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log('UI stability gate passed.');
