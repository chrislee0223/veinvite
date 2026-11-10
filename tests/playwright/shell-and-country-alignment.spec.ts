import { expect, test } from '@playwright/test';

const RESPONSIVE_WIDTHS = [320, 393, 560, 600, 640, 1280] as const;
const RISKY_LOCALES = ['de', 'ar'] as const;

for (const locale of RISKY_LOCALES) {
  for (const width of RESPONSIVE_WIDTHS) {
    test(`main header and bottom navigation keep separate icon/label lanes: ${locale} ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 852 });
      await page.goto(
        `/qa/state?state=HOME-SLOTS-FULL&locale=${locale}`,
        { waitUntil: 'domcontentloaded', timeout: 30_000 },
      );

      await expect(page.locator('main.screen > .topBar')).toBeVisible();
      await expect(page.locator('nav.bottomNavigation')).toBeVisible();
      await expect(page.locator('main.screen > .topBar .accountChip')).toBeVisible();

      const geometry = await page.evaluate(() => {
        const header = document.querySelector<HTMLElement>('main.screen > .topBar');
        const actions = header?.querySelector<HTMLElement>('.topActions');
        const account = actions?.querySelector<HTMLElement>('.accountChip');
        const utilities = actions?.querySelector<HTMLElement>('.utilityActions');
        const nav = document.querySelector<HTMLElement>('nav.bottomNavigation');

        if (!header || !actions || !account || !utilities || !nav) {
          throw new Error('The real Home header or navigation was not mounted');
        }

        const r = (element: Element) => element.getBoundingClientRect();
        const track = nav.querySelector<HTMLElement>(':scope > div');
        if (!track) throw new Error('Missing bottom navigation track');

        const buttons = Array.from(track.querySelectorAll<HTMLButtonElement>('button'));
        const labels = buttons.map((button) => {
          const icon = button.querySelector<HTMLElement>('.navIcon');
          const label = button.querySelector<HTMLElement>('.navLabel');
          if (!icon || !label) throw new Error('Missing nav icon or label');
          const ib = r(icon);
          const lb = r(label);
          const bb = r(button);
          return {
            iconBottom: ib.bottom,
            labelTop: lb.top,
            labelBottom: lb.bottom,
            buttonBottom: bb.bottom,
            buttonHeight: bb.height,
          };
        });

        const ar = r(account);
        const ur = r(utilities);
        const hr = r(header);
        const nr = r(nav);
        return {
          actionDirection: getComputedStyle(actions).flexDirection,
          accountCenterY: (ar.top + ar.bottom) / 2,
          utilityCenterY: (ur.top + ur.bottom) / 2,
          actionsWithinHeader: Math.min(ar.left, ur.left) >= hr.left - 1
            && Math.max(ar.right, ur.right) <= hr.right + 1,
          navWithinViewport: nr.left >= -1 && nr.right <= innerWidth + 1,
          labels,
        };
      });

      expect(geometry.actionsWithinHeader).toBe(true);
      expect(geometry.navWithinViewport).toBe(true);
      expect(geometry.labels).toHaveLength(4);
      for (const label of geometry.labels) {
        expect(label.labelTop).toBeGreaterThanOrEqual(label.iconBottom + 1);
        expect(label.labelBottom).toBeLessThanOrEqual(label.buttonBottom + 1);
        expect(label.buttonHeight).toBeGreaterThanOrEqual(56);
      }

      if (width >= 561 && width <= 640) {
        expect(geometry.actionDirection).toBe('row');
        expect(Math.abs(geometry.accountCenterY - geometry.utilityCenterY)).toBeLessThanOrEqual(2);
      }
    });
  }
}

for (const width of [600, 1280]) {
  test(`desktop country metric values keep the same grid centers as their headers: ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/qa/state?state=LEADERBOARD-LIST&locale=ko', {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    });

    // Use the production global country-table CSS with an isolated ten-row
    // fixture. This forces a native scrollbar without changing production data.
    const measurements = await page.evaluate(() => {
      const host = document.createElement('section');
      host.className = 'leaderboardHub';
      host.id = 'qa-country-scrollbar-axes';
      host.style.width = '520px';
      host.style.margin = '0 auto';
      const panel = document.createElement('div');
      panel.className = 'countryPanel';
      const header = document.createElement('div');
      header.className = 'countryHeader';
      for (const label of ['Rank', 'Country', 'New', 'Return', 'Total']) {
        const span = document.createElement('span');
        span.textContent = label;
        header.appendChild(span);
      }
      const scroll = document.createElement('div');
      scroll.className = 'countryScroll';
      scroll.style.height = '250px';
      scroll.style.maxHeight = '250px';
      scroll.style.overflowY = 'scroll';
      for (let i = 0; i < 10; i += 1) {
        const row = document.createElement('div');
        row.className = 'countryRow';
        for (const [index, label] of ['1', 'Turkey', '11', '0', '11'].entries()) {
          const span = document.createElement('span');
          span.textContent = label;
          if (index === 0) span.className = 'countryRank';
          if (index === 1) span.className = 'countryIdentity';
          if (index === 2) span.className = 'countryMetricValue countryNew';
          if (index === 3) span.className = 'countryMetricValue countryReturning';
          if (index === 4) span.className = 'countryMetricValue countryTotal';
          row.appendChild(span);
        }
        scroll.appendChild(row);
      }
      panel.append(header, scroll);
      host.appendChild(panel);
      document.body.appendChild(host);
      const centers = (container: Element) =>
        Array.from(container.children).slice(2).map((node) => {
          const rect = node.getBoundingClientRect();
          return (rect.left + rect.right) / 2;
        });
      return {
        header: centers(header),
        row: centers(scroll.firstElementChild!),
        headerGutter: getComputedStyle(header).scrollbarGutter,
        scrollGutter: getComputedStyle(scroll).scrollbarGutter,
      };
    });

    expect(measurements.headerGutter).toContain('stable');
    expect(measurements.scrollGutter).toContain('stable');
    expect(measurements.header).toHaveLength(3);
    for (let i = 0; i < 3; i += 1) {
      expect(Math.abs(measurements.header[i] - measurements.row[i])).toBeLessThanOrEqual(1);
    }
  });
}
