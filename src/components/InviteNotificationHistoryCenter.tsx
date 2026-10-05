'use client';

import type { ComponentProps } from 'react';

import {
  InviteNotificationHistoryCenter as UnifiedInviteNotificationHistoryCenter,
} from './UnifiedInviteNotificationHistoryCenter';

type Props = ComponentProps<
  typeof UnifiedInviteNotificationHistoryCenter
>;

export function InviteNotificationHistoryCenter(props: Props) {
  return (
    <UnifiedInviteNotificationHistoryCenter {...props} />
  );
}
