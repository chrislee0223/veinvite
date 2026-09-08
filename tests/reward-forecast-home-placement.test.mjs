import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import test from 'node:test';

const homeClient = await readFile(
  new URL('../src/components/HomeClient.tsx', import.meta.url),
  'utf8',
);
const appProviders = await readFile(
  new URL('../src/components/AppProviders.tsx', import.meta.url),
  'utf8',
);
const forecastCard = await readFile(
  new URL('../src/components/PublicRewardForecastCard.tsx', import.meta.url),
  'utf8',
);

async function doesNotExist(relativePath) {
  try {
    await access(new URL(relativePath, import.meta.url));
    return false;
  } catch {
    return true;
  }
}

test('Home renders the reward forecast before wallet connect or invite-link actions', () => {
  const forecastIndex = homeClient.indexOf(
    '<PublicRewardForecastCard locale={locale} />',
  );
  const walletBranchIndex = homeClient.indexOf('{!wallet ? (');
  const permanentLinkIndex = homeClient.indexOf(
    'className="permanentLinkCard"',
  );

  assert.ok(forecastIndex >= 0, 'Home should render the forecast card.');
  assert.ok(
    walletBranchIndex > forecastIndex,
    'Forecast should appear before the wallet-dependent Home branch.',
  );
  assert.ok(
    permanentLinkIndex > forecastIndex,
    'Forecast should appear above the permanent invite-link card.',
  );
});

test('Home forecast remains independent from Home startup readiness', () => {
  assert.match(forecastCard, /\/api\/rewards\/estimate/);
  assert.doesNotMatch(forecastCard, /publishHomeStartupState/);
  assert.doesNotMatch(forecastCard, /referralLinkVerified/);
  assert.match(forecastCard, /min-height:142px/);
  assert.match(forecastCard, /amountSkeleton/);
  assert.match(forecastCard, /prefers-reduced-motion: reduce/);
});

test('leaderboard portal and deferred loader are no longer mounted', async () => {
  assert.doesNotMatch(appProviders, /DeferredStartupExtras/);
  assert.equal(
    await doesNotExist('../src/components/DeferredStartupExtras.tsx'),
    true,
  );
  assert.equal(
    await doesNotExist('../src/components/PublicRewardForecastPortal.tsx'),
    true,
  );
  assert.doesNotMatch(forecastCard, /createPortal/);
  assert.doesNotMatch(forecastCard, /MutationObserver/);
  assert.doesNotMatch(forecastCard, /leaderboardPage/);
});
