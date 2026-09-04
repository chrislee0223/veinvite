'use client';

import dynamic from 'next/dynamic';
import { usePathname } from 'next/navigation';

const InviteFlowVisualPolish = dynamic(
  () =>
    import('./InviteFlowVisualPolish').then(
      (module) => module.InviteFlowVisualPolish,
    ),
  { ssr: false },
);

const HeaderLanguagePickerPortal = dynamic(
  () =>
    import('./HeaderLanguagePickerPortal').then(
      (module) => module.HeaderLanguagePickerPortal,
    ),
  { ssr: false },
);

function needsInviteEnhancements(pathname: string): boolean {
  return (
    pathname.startsWith('/i/') ||
    pathname.startsWith('/r/') ||
    pathname.startsWith('/ui-test')
  );
}

export function RouteScopedInviteEnhancements() {
  const pathname = usePathname();

  if (!needsInviteEnhancements(pathname)) {
    return null;
  }

  return (
    <>
      <InviteFlowVisualPolish />
      <HeaderLanguagePickerPortal />
    </>
  );
}
