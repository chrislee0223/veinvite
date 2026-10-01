import {
  NETWORK_CANVAS_CENTER_X,
  NETWORK_CANVAS_ROOT_Y,
  networkCanvasChildPoint,
  networkCanvasInviteSlotPointById,
  normalizeNetworkWallet as keyWallet,
} from '@/lib/networkCanvasGeometry';
import type {
  PublishedNetworkLayoutSnapshot,
} from '@/lib/networkPublishedLayout';
import {
  EMPTY_NETWORK_FOCUS_WORKSPACE,
  deriveNetworkWorkspaceVisibility,
  groupContainingWallet,
  type NetworkFocusWorkspace,
  type NetworkWorkspaceGroup,
} from '@/lib/networkWorkspace';
import {
  defaultGroupMemberOffset,
} from '@/lib/networkAppViewHelpers';

export type PublicLayoutChild = {
  wallet: string;
  network: number;
  direct: number;
  depth: number;
};

export type PublicLayoutData = {
  focusWallet: string;
  focusDepth: number;
  breadcrumb: string[];
  children: PublicLayoutChild[];
  availableSlotIds?: Array<1 | 2>;
  slotAvailabilityKnown?: boolean;
  publishedLayout?:
    PublishedNetworkLayoutSnapshot | null;
};

export type PublicInviteSlotVisual = {
  slot: 1 | 2;
  x: number;
  y: number;
};

export type PublicVisual = {
  wallet: string;
  parentWallet: string | null;
  x: number;
  y: number;
  depth: number;
  root: boolean;
  member: PublicLayoutChild | null;
};

export type PublicEdge = {
  key: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  active: boolean;
};

export type PublicOwnerLayoutView = {
  focusKey: string;
  workspace: NetworkFocusWorkspace;
  inviteSlots: PublicInviteSlotVisual[];
  layout: {
    visuals: PublicVisual[];
    edges: PublicEdge[];
    positions: Map<
      string,
      {
        x: number;
        y: number;
        depth: number;
      }
    >;
    groups: NetworkWorkspaceGroup[];
    startDepth: number;
  };
};

export function derivePublicOwnerLayoutView({
  focusData,
  workspaceOverride,
  isMobile,
  activePathLength,
}: {
  focusData: PublicLayoutData | null;
  workspaceOverride?:
    NetworkFocusWorkspace | null;
  isMobile: boolean;
  activePathLength: number;
}): PublicOwnerLayoutView {
  const emptyLayout = {
    visuals: [] as PublicVisual[],
    edges: [] as PublicEdge[],
    positions: new Map<
      string,
      {
        x: number;
        y: number;
        depth: number;
      }
    >(),
    groups: [] as NetworkWorkspaceGroup[],
    startDepth:
      Math.max(0, activePathLength - 1),
  };

  if (!focusData) {
    return {
      focusKey: '',
      workspace:
        EMPTY_NETWORK_FOCUS_WORKSPACE,
      inviteSlots: [],
      layout: emptyLayout,
    };
  }

  const focusKey =
    keyWallet(focusData.focusWallet);
  const ownerWorkspace =
    focusData.publishedLayout
      ?.workspace ??
    EMPTY_NETWORK_FOCUS_WORKSPACE;
  const workspace =
    workspaceOverride ??
    ownerWorkspace;
  const ownerLayoutActive =
    Boolean(
      focusData.publishedLayout,
    );

  const positionedChildren =
    focusData.children.map(
      (child, index) => {
        const wallet =
          keyWallet(child.wallet);
        const fallback =
          networkCanvasChildPoint(
            wallet,
            index,
            ownerLayoutActive
              ? false
              : isMobile,
          );
        const saved =
          workspace.positions[wallet];

        return {
          ...child,
          x: saved?.x ?? fallback.x,
          y: saved?.y ?? fallback.y,
        };
      },
    );

  const inviteSlots =
    focusData.slotAvailabilityKnown ===
      true &&
    Array.isArray(
      focusData.availableSlotIds,
    )
      ? focusData.availableSlotIds
          .filter(
            (
              slot,
            ): slot is 1 | 2 =>
              slot === 1 ||
              slot === 2,
          )
          .map((slot) => {
            const fallback =
              networkCanvasInviteSlotPointById(
                slot,
              );
            const saved =
              workspace.positions[
                `slot:${slot}`
              ];

            return {
              slot,
              x:
                saved?.x ??
                fallback.x,
              y:
                saved?.y ??
                fallback.y,
            };
          })
      : [];

  const visibility =
    deriveNetworkWorkspaceVisibility({
      positionedChildren,
      positionedInviteSlots:
        inviteSlots.map((slot) => ({
          ...slot,
          state: 'AVAILABLE',
          inviteeWallet: null,
        })),
      groups: workspace.groups,
      groupDraft: null,
      groupingWallet: null,
      defaultMemberOffset:
        defaultGroupMemberOffset,
    });

  const visuals: PublicVisual[] = [];
  const edges: PublicEdge[] = [];
  const positions =
    new Map<
      string,
      {
        x: number;
        y: number;
        depth: number;
      }
    >();

  positions.set(
    focusKey,
    {
      x: NETWORK_CANVAS_CENTER_X,
      y: NETWORK_CANVAS_ROOT_Y,
      depth: focusData.focusDepth,
    },
  );
  visuals.push({
    wallet: focusKey,
    parentWallet:
      focusData.breadcrumb.length > 1
        ? keyWallet(
            focusData.breadcrumb[
              focusData.breadcrumb.length - 2
            ],
          )
        : null,
    x: NETWORK_CANVAS_CENTER_X,
    y: NETWORK_CANVAS_ROOT_Y,
    depth: focusData.focusDepth,
    root: true,
    member: null,
  });

  for (
    const child of
      visibility.displayedChildren
  ) {
    positions.set(
      keyWallet(child.wallet),
      {
        x: child.x,
        y: child.y,
        depth: child.depth,
      },
    );
  }

  for (
    const child of
      visibility.visibleChildren
  ) {
    const wallet =
      keyWallet(child.wallet);
    visuals.push({
      wallet,
      parentWallet: focusKey,
      x: child.x,
      y: child.y,
      depth: child.depth,
      root: false,
      member: child,
    });

    if (
      !groupContainingWallet(
        workspace,
        wallet,
      )
    ) {
      edges.push({
        key:
          focusKey +
          '->' +
          wallet,
        x1:
          NETWORK_CANVAS_CENTER_X,
        y1:
          NETWORK_CANVAS_ROOT_Y,
        x2: child.x,
        y2: child.y,
        active: false,
      });
    }
  }

  for (
    const group of
      visibility.visibleGroups
  ) {
    edges.push({
      key:
        focusKey +
        '->group:' +
        group.id,
      x1:
        NETWORK_CANVAS_CENTER_X,
      y1:
        NETWORK_CANVAS_ROOT_Y,
      x2: group.x,
      y2: group.y,
      active: false,
    });

    if (
      group.collapsed === false
    ) {
      for (
        const member of
          group.members
      ) {
        const child =
          visibility
            .visibleChildByWallet
            .get(keyWallet(member));
        if (!child) continue;

        edges.push({
          key:
            'group:' +
            group.id +
            '->' +
            keyWallet(member),
          x1: group.x,
          y1: group.y,
          x2: child.x,
          y2: child.y,
          active: false,
        });
      }
    }
  }

  return {
    focusKey,
    workspace,
    inviteSlots,
    layout: {
      visuals,
      edges,
      positions,
      groups:
        visibility.visibleGroups,
      startDepth:
        Math.max(
          0,
          activePathLength - 1,
        ),
    },
  };
}
