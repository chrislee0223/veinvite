from pathlib import Path
import re

home_path = Path('src/components/HomeClient.tsx')
source = home_path.read_text()


def replace_once(old: str, new: str, label: str) -> None:
    global source
    count = source.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected one match, found {count}')
    source = source.replace(old, new, 1)


replace_once(
    "import type { ReferralLinkRecord } from '@/lib/referralLinks';",
    "import { isReferralKey, type ReferralLinkRecord } from '@/lib/referralLinks';",
    'referral link import',
)

replace_once(
    "const VERCEL_SHARE_STORAGE_KEY = 'veinvite_vercel_share';",
    "const VERCEL_SHARE_STORAGE_KEY = 'veinvite_vercel_share';\nconst REFERRAL_LINK_SESSION_PREFIX = 'veinvite_referral_link_v1:';",
    'session cache constant',
)

replace_once(
    "const B3TR_SCALE = 10n ** B3TR_DECIMALS;\n\nfunction formatB3trWei",
    """const B3TR_SCALE = 10n ** B3TR_DECIMALS;

function referralLinkSessionKey(wallet: string): string {
  return `${REFERRAL_LINK_SESSION_PREFIX}${wallet.toLowerCase()}`;
}

function readCachedReferralLink(wallet: string): ReferralLinkRecord | null {
  try {
    const raw = window.sessionStorage.getItem(referralLinkSessionKey(wallet));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      key?: unknown;
      createdAt?: unknown;
    };
    if (
      typeof parsed.key !== 'string' ||
      !isReferralKey(parsed.key) ||
      typeof parsed.createdAt !== 'string'
    ) {
      window.sessionStorage.removeItem(referralLinkSessionKey(wallet));
      return null;
    }
    return {
      key: parsed.key,
      createdAt: parsed.createdAt,
      slotsAvailable: 0,
    };
  } catch {
    return null;
  }
}

function writeCachedReferralLink(
  wallet: string,
  link: ReferralLinkRecord,
): void {
  try {
    window.sessionStorage.setItem(
      referralLinkSessionKey(wallet),
      JSON.stringify({ key: link.key, createdAt: link.createdAt }),
    );
  } catch {
    // Storage can be unavailable in hardened/private browser modes. The server
    // remains authoritative, so cache failure should never block the Home UI.
  }
}

function sameWallet(left: string | null, right: string): boolean {
  return left?.toLowerCase() === right.toLowerCase();
}

function formatB3trWei""",
    'cache helpers',
)

replace_once(
    """  const [referralLink, setReferralLink] =
    useState<ReferralLinkRecord | null>(null);
  const [loading, setLoading] = useState(false);""",
    """  const [referralLink, setReferralLink] =
    useState<ReferralLinkRecord | null>(null);
  const [invitesReady, setInvitesReady] = useState(false);
  const [referralLinkVerified, setReferralLinkVerified] = useState(false);
  const [referralLinkFailed, setReferralLinkFailed] = useState(false);
  const [loading, setLoading] = useState(false);""",
    'Home state',
)

replace_once(
    """  const feedbackIdRef = useRef(0);
  const cancelTriggerRef = useRef<HTMLButtonElement | null>(null);""",
    """  const feedbackIdRef = useRef(0);
  const activeWalletRef = useRef<string | null>(wallet);
  const cancelTriggerRef = useRef<HTMLButtonElement | null>(null);""",
    'wallet request guard',
)

replace_once(
    "  const changeLocale = (nextLocale: SupportedLocale) => {",
    """  useEffect(() => {
    activeWalletRef.current = wallet;
    setInvites([]);
    setInvitesReady(false);
    setReferralLinkVerified(false);
    setReferralLinkFailed(false);
    setReferralLink(wallet ? readCachedReferralLink(wallet) : null);
  }, [wallet]);

  const changeLocale = (nextLocale: SupportedLocale) => {""",
    'wallet cache hydration',
)

load_pattern = re.compile(
    r"  const load = useCallback\(async \(quiet = false\) => \{.*?\n  \}, \[wallet, t\.loadError, t\.createError, t\.genericError, showFeedback\]\);",
    re.S,
)
load_replacement = """  const load = useCallback(async (quiet = false) => {
    if (!wallet) return;
    const requestWallet = wallet;

    try {
      const [inviteResult, linkResult] = await Promise.allSettled([
        fetch(
          `/api/invites?inviter=${encodeURIComponent(requestWallet)}`,
          { cache: 'no-store' },
        ),
        fetch('/api/referral-links', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ inviterAddress: requestWallet }),
        }),
      ]);

      if (!sameWallet(activeWalletRef.current, requestWallet)) return;

      if (inviteResult.status === 'rejected') {
        if (!quiet) {
          setInvitesReady(false);
          showFeedback('error', t.loadError);
        }
      } else {
        try {
          const inviteResponse = inviteResult.value;
          const inviteData = (await inviteResponse.json()) as {
            invites?: InviteRecord[];
            error?: string;
          };
          if (!inviteResponse.ok) {
            throw new Error(inviteData.error ?? t.loadError);
          }
          if (!sameWallet(activeWalletRef.current, requestWallet)) return;
          setInvites(inviteData.invites ?? []);
          setInvitesReady(true);
        } catch (error) {
          if (!quiet && sameWallet(activeWalletRef.current, requestWallet)) {
            setInvitesReady(false);
            showFeedback(
              'error',
              error instanceof Error ? error.message : t.loadError,
            );
          }
        }
      }

      if (!sameWallet(activeWalletRef.current, requestWallet)) return;

      if (linkResult.status === 'rejected') {
        if (!quiet) {
          setReferralLinkVerified(false);
          setReferralLinkFailed(true);
          showFeedback('error', t.createError);
        }
        return;
      }

      try {
        const linkResponse = linkResult.value;
        const linkData = (await linkResponse.json()) as {
          referralLink?: ReferralLinkRecord | null;
          error?: string;
        };
        if (!linkResponse.ok || !linkData.referralLink) {
          throw new Error(linkData.error ?? t.createError);
        }
        if (!sameWallet(activeWalletRef.current, requestWallet)) return;

        setReferralLink(linkData.referralLink);
        setReferralLinkVerified(true);
        setReferralLinkFailed(false);
        writeCachedReferralLink(requestWallet, linkData.referralLink);
      } catch (error) {
        if (!quiet && sameWallet(activeWalletRef.current, requestWallet)) {
          setReferralLinkVerified(false);
          setReferralLinkFailed(true);
          showFeedback(
            'error',
            error instanceof Error ? error.message : t.createError,
          );
        }
      }
    } catch (error) {
      if (!quiet && sameWallet(activeWalletRef.current, requestWallet)) {
        setReferralLinkVerified(false);
        setReferralLinkFailed(true);
        showFeedback(
          'error',
          error instanceof Error ? error.message : t.genericError,
        );
      }
    }
  }, [wallet, t.loadError, t.createError, t.genericError, showFeedback]);"""
source, count = load_pattern.subn(load_replacement, source, count=1)
if count != 1:
    raise SystemExit(f'load function: expected one match, found {count}')

render_pattern = re.compile(
    r"          \{!wallet \? \(.*?\n          \{outstandingRewards\.length > 0 \? \(",
    re.S,
)
render_replacement = """          {!wallet ? (
            <button
              type="button"
              className="primaryAction"
              disabled={isWalletModalOpen}
              onClick={() => {
                clearFeedback();
                openWallet();
              }}
            >
              {isWalletModalOpen ? t.connecting : t.connectStart}
              <span aria-hidden="true">›</span>
            </button>
          ) : (
            <>
              {referralLinkFailed && !referralLink ? (
                <div className="linkErrorCard" role="status">
                  <strong>{t.loadError}</strong>
                </div>
              ) : (
                <div className="permanentLinkCard">
                  {referralLink ? (
                    <div className="linkPreview" title={permanentInviteUrl}>
                      {permanentInviteUrl || '—'}
                    </div>
                  ) : (
                    <div
                      className="linkPreview linkPreviewSkeleton"
                      aria-hidden="true"
                    />
                  )}
                  <div className="linkActions">
                    <button
                      type="button"
                      className="primaryAction compactAction"
                      disabled={!referralLinkVerified || !permanentInviteUrl}
                      onClick={() => void shareUrl(permanentInviteUrl)}
                    >
                      {t.shareInvite}
                    </button>
                    <button
                      type="button"
                      className="secondaryAction compactAction"
                      disabled={!referralLinkVerified || !permanentInviteUrl}
                      onClick={() => void copyUrl(permanentInviteUrl)}
                    >
                      {t.copyLink}
                    </button>
                  </div>
                </div>
              )}

              {invitesReady ? (
                <div className="slotsBlock">
                  <div className="slotsHeading">
                    <strong>{referral.slotsLabel}</strong>
                    <span>{slotInvites.size}/2</span>
                  </div>
                  <FriendSlot
                    number={1}
                    invite={slotInvites.get(1)}
                    copy={referral}
                    progressCopy={progressCopy}
                    onShare={() => void shareUrl(permanentInviteUrl)}
                    shareDisabled={!referralLinkVerified || !permanentInviteUrl}
                    onCopyLegacy={(invite) =>
                      void copyUrl(legacyInviteUrl(invite))}
                    onCancelLegacy={(invite, trigger) => {
                      cancelTriggerRef.current = trigger;
                      setLegacyCancelTarget(invite);
                    }}
                    copyLabel={t.copyLink}
                    cancelLabel={t.cancelInvite}
                  />
                  <FriendSlot
                    number={2}
                    invite={slotInvites.get(2)}
                    copy={referral}
                    progressCopy={progressCopy}
                    onShare={() => void shareUrl(permanentInviteUrl)}
                    shareDisabled={!referralLinkVerified || !permanentInviteUrl}
                    onCopyLegacy={(invite) =>
                      void copyUrl(legacyInviteUrl(invite))}
                    onCancelLegacy={(invite, trigger) => {
                      cancelTriggerRef.current = trigger;
                      setLegacyCancelTarget(invite);
                    }}
                    copyLabel={t.copyLink}
                    cancelLabel={t.cancelInvite}
                  />
                </div>
              ) : (
                <div className="slotsBlock slotsSkeleton" aria-hidden="true">
                  <div className="slotsHeading">
                    <strong>{referral.slotsLabel}</strong>
                    <span>—/2</span>
                  </div>
                  <div className="slotSkeleton" />
                  <div className="slotSkeleton" />
                </div>
              )}
            </>
          )}

          {outstandingRewards.length > 0 ? ("""
source, count = render_pattern.subn(render_replacement, source, count=1)
if count != 1:
    raise SystemExit(f'Home render: expected one match, found {count}')

replace_once(
    """function FriendSlot({
  number,
  invite,
  copy,
  progressCopy,
  onShare,
  onCopyLegacy,""",
    """function FriendSlot({
  number,
  invite,
  copy,
  progressCopy,
  onShare,
  shareDisabled,
  onCopyLegacy,""",
    'FriendSlot shareDisabled destructure',
)

replace_once(
    """  progressCopy: (typeof PROGRESS_CLAIM_COPY)[SupportedLocale];
  onShare: () => void;
  onCopyLegacy: (invite: InviteRecord) => void;""",
    """  progressCopy: (typeof PROGRESS_CLAIM_COPY)[SupportedLocale];
  onShare: () => void;
  shareDisabled: boolean;
  onCopyLegacy: (invite: InviteRecord) => void;""",
    'FriendSlot shareDisabled type',
)

replace_once(
    """      <button
        type="button"
        className="friendSlot available"
        onClick={onShare}""",
    """      <button
        type="button"
        className="friendSlot available"
        disabled={shareDisabled}
        onClick={onShare}""",
    'available slot disable guard',
)

replace_once(
    """        .linkPreview { padding:11px 12px; overflow:hidden; border:1px solid rgba(255,255,255,.08); border-radius:13px; background:rgba(3,4,5,.42); color:#b8b2c2; font-size:.68rem; font-weight:750; white-space:nowrap; text-overflow:ellipsis; direction:ltr; text-align:left; }
        .linkActions { margin-top:11px; display:grid; grid-template-columns:1fr 1fr; gap:9px; }""",
    """        .linkPreview { padding:11px 12px; overflow:hidden; border:1px solid rgba(255,255,255,.08); border-radius:13px; background:rgba(3,4,5,.42); color:#b8b2c2; font-size:.68rem; font-weight:750; white-space:nowrap; text-overflow:ellipsis; direction:ltr; text-align:left; }
        .linkPreviewSkeleton { min-height:38px; box-sizing:border-box; position:relative; overflow:hidden; }
        .linkPreviewSkeleton::after { content:''; position:absolute; top:50%; left:12px; width:68%; height:8px; border-radius:999px; background:rgba(255,255,255,.09); transform:translateY(-50%); animation:skeletonPulse 1.5s ease-in-out infinite; }
        .linkActions { margin-top:11px; display:grid; grid-template-columns:1fr 1fr; gap:9px; }""",
    'link skeleton styles',
)

replace_once(
    """        .primaryAction:disabled { opacity:.42; cursor:not-allowed; box-shadow:none; }
        .secondaryAction { border:1px solid rgba(255,255,255,.11); background:rgba(255,255,255,.045); color:#fff; }""",
    """        .primaryAction:disabled { opacity:.42; cursor:not-allowed; box-shadow:none; }
        .secondaryAction { border:1px solid rgba(255,255,255,.11); background:rgba(255,255,255,.045); color:#fff; }
        .secondaryAction:disabled { opacity:.42; cursor:not-allowed; }""",
    'disabled secondary action',
)

replace_once(
    """        .slotsHeading span { flex:0 0 auto; min-width:42px; padding:5px 8px; border:1px solid rgba(255,255,255,.08); border-radius:999px; color:#ffd66e; text-align:center; font-size:.66rem; font-weight:950; }
        .loadingCard { position:relative; z-index:1; min-height:58px; margin-top:22px; padding:12px 14px; display:flex; align-items:center; justify-content:center; gap:10px; border:1px solid rgba(255,201,61,.18); border-radius:17px; background:rgba(244,183,40,.06); color:#ffd66e; text-align:center; }
        .pulseDot { flex:0 0 auto; width:9px; height:9px; border-radius:50%; background:#f4b728; box-shadow:0 0 18px rgba(244,183,40,.72); animation:pulse 1.6s ease-in-out infinite; }""",
    """        .slotsHeading span { flex:0 0 auto; min-width:42px; padding:5px 8px; border:1px solid rgba(255,255,255,.08); border-radius:999px; color:#ffd66e; text-align:center; font-size:.66rem; font-weight:950; }
        .slotSkeleton { min-height:68px; box-sizing:border-box; position:relative; overflow:hidden; border:1px solid rgba(255,255,255,.07); border-radius:16px; background:rgba(255,255,255,.022); }
        .slotSkeleton::after { content:''; position:absolute; top:50%; left:14px; width:54%; height:9px; border-radius:999px; background:rgba(255,255,255,.075); transform:translateY(-50%); animation:skeletonPulse 1.5s ease-in-out infinite; }
        .linkErrorCard { position:relative; z-index:1; min-height:58px; margin-top:18px; padding:12px 14px; display:flex; align-items:center; justify-content:center; border:1px solid rgba(255,201,61,.18); border-radius:17px; background:rgba(244,183,40,.06); color:#ffd66e; text-align:center; }""",
    'slot and error styles',
)

replace_once(
    "@keyframes pulse { 0%,100% { opacity:.55; transform:scale(.9); } 50% { opacity:1; transform:scale(1.08); } }",
    "@keyframes skeletonPulse { 0%,100% { opacity:.5; } 50% { opacity:1; } }",
    'skeleton animation',
)

replace_once(
    "  button.friendSlot { font:inherit; cursor:pointer; }",
    "  button.friendSlot { font:inherit; cursor:pointer; }\n  button.friendSlot:disabled { opacity:.55; cursor:not-allowed; }",
    'available slot disabled style',
)

if 'loading ? t.creating' in source:
    raise SystemExit('Home still renders the misleading creating copy')

home_path.write_text(source)

test_path = Path('tests/referral-link-refresh-cache.test.mjs')
test_path.write_text("""import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile('src/components/HomeClient.tsx', 'utf8');

test('Home restores permanent referral links from wallet-scoped session storage', () => {
  assert.match(source, /REFERRAL_LINK_SESSION_PREFIX/);
  assert.match(source, /window\.sessionStorage\.getItem\(referralLinkSessionKey\(wallet\)\)/);
  assert.match(source, /wallet\.toLowerCase\(\)/);
  assert.match(source, /isReferralKey\(parsed\.key\)/);
  assert.match(source, /writeCachedReferralLink\(requestWallet, linkData\.referralLink\)/);
});

test('cached links stay non-authoritative until the server verifies them', () => {
  assert.match(source, /setReferralLinkVerified\(false\)/);
  assert.match(source, /setReferralLinkVerified\(true\)/);
  assert.match(source, /disabled=\{!referralLinkVerified \|\| !permanentInviteUrl\}/);
  assert.match(source, /shareDisabled=\{!referralLinkVerified \|\| !permanentInviteUrl\}/);
  assert.match(source, /sameWallet\(activeWalletRef\.current, requestWallet\)/);
});

test('refresh never claims to create a new link and never guesses slot counts', () => {
  assert.doesNotMatch(source, /loading \? t\.creating/);
  assert.match(source, /invitesReady \? \(/);
  assert.match(source, /<span>—\/2<\/span>/);
  assert.match(source, /className="slotSkeleton"/);
});

test('server remains authoritative and the referral ensure endpoint is unchanged', () => {
  assert.match(source, /fetch\('\/api\/referral-links', \{/);
  assert.match(source, /method: 'POST'/);
  assert.match(source, /setReferralLink\(linkData\.referralLink\)/);
});
""")

ci_path = Path('.github/workflows/ci.yml')
ci = ci_path.read_text()
old_gate = "run: node --test tests/referral-permanent-link-rollout.test.mjs tests/referral-v2-legacy-cancel-copy.test.mjs"
new_gate = "run: node --test tests/referral-permanent-link-rollout.test.mjs tests/referral-v2-legacy-cancel-copy.test.mjs tests/referral-link-refresh-cache.test.mjs"
if ci.count(old_gate) != 1:
    raise SystemExit('Referral v2 CI gate anchor changed')
ci_path.write_text(ci.replace(old_gate, new_gate, 1))
