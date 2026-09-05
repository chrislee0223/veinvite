import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';

import { AppProviders } from '@/components/AppProviders';
import { LocaleDocumentSync } from '@/components/LocaleDocumentSync';
import { LocaleHydrationShield } from '@/components/LocaleHydrationShield';
import { UsageAnalyticsPreferenceControl } from '@/components/UsageAnalyticsPreferenceControl';
import { UsageAnalyticsTracker } from '@/components/UsageAnalyticsTracker';
import './globals.css';
import './header-language-flags.css';
import './localized-typography.css';
import './notification-i18n-hardening.css';
import './ui-safety.css';
import './final-ui-hardening.css';
import './podium-laurel-option-c.css';
import './podium-laurel-size-tuning.css';
import './wallet-confirmation-unified.css';
import './language-picker-mobile.css';
import './legal-ui-consistency.css';

const siteUrl = 'https://veinvite.vercel.app';
const title = 'VeInvite | Verified onboarding for VeBetterDAO';
const description =
  'VeInvite verifies referral onboarding using wallet entry history, qualifying VeBetterDAO activity, and governance participation.';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title,
  description,
  applicationName: 'VeInvite',
  alternates: {
    canonical: '/',
  },
  icons: {
    icon: '/veinvite-logo.webp',
    shortcut: '/veinvite-logo.webp',
  },
  openGraph: {
    title,
    description,
    url: siteUrl,
    siteName: 'VeInvite',
    type: 'website',
  },
  twitter: {
    card: 'summary',
    title,
    description,
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  const usageAnalyticsEnabled =
    process.env.VERCEL_ENV === 'production';

  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <LocaleHydrationShield />
        <AppProviders>
          <LocaleDocumentSync />
          {usageAnalyticsEnabled ? <UsageAnalyticsTracker /> : null}
          {children}
          {usageAnalyticsEnabled ? (
            <UsageAnalyticsPreferenceControl />
          ) : null}
        </AppProviders>
      </body>
    </html>
  );
}
