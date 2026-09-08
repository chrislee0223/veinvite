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

test('Home visually prioritizes invite actions, then reward estimate, then progress slots', () => {
  assert.match(
    homeClient,
    /<PublicRewardForecastCard locale=\{locale\} \/>/,
    'Home should keep rendering the reward forecast card.',
  );
  assert.match(
    forecastCard,
    /:global\(\.missionCard\)\s*\{[\s\S]*?display:flex;[\s\S]*?flex-direction:column;/,
    'The Home card should use an explicit presentation order.',
  );
  assert.match(
    forecastCard,
    /:global\(\.missionCard > \.permanentLinkCard\)[\s\S]*?order:1;/,
    'The permanent invite-link card should be visually first after the title.',
  );
  assert.match(
    forecastCard,
    /\.homeRewardEstimateCard\s*\{[\s\S]*?order:2;/,
    'The reward estimate should follow the invite-link or connect action.',
  );
  assert.match(
    forecastCard,
    /:global\(\.missionCard > \.slotsBlock\)\s*\{[\s\S]*?order:3;/,
    'Friend progress slots should follow the reward estimate.',
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

test('reward amount keeps the previously proven in-card geometry after the move', () => {
  assert.doesNotMatch(forecastCard, /className="estimateSummaryRow"/);
  assert.match(
    forecastCard,
    /className="estimateEyebrow">\{t\.eyebrow\}<\/span>[\s\S]*?className="estimateAmount"/,
  );
  assert.match(
    forecastCard,
    /\.estimateAmount\s*\{[\s\S]*?min-height:35px;[\s\S]*?margin-top:6px;/,
  );
  assert.match(
    forecastCard,
    /\.estimateAmount strong\s*\{[\s\S]*?font-size:clamp\(1\.34rem,6\.5vw,1\.72rem\)/,
  );
  assert.match(forecastCard, /margin-top:17px/);
  assert.match(forecastCard, /border-radius:18px/);
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
