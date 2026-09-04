'use client';

/**
 * The initial Home shell may now render while wallet-scoped referral data is
 * revalidating. Keep the existing skeletons visible during that short window
 * instead of leaving blank gaps. The stricter wallet-switch shield still
 * covers these placeholders during account changes.
 */
export function StartupHydrationPlaceholders() {
  return (
    <style jsx global>{`
      .linkPreviewSkeleton,
      .slotsSkeleton {
        visibility: visible !important;
      }

      .slotsSkeleton {
        opacity: 0.72;
        pointer-events: none;
      }

      @media (prefers-reduced-motion: reduce) {
        .linkPreviewSkeleton::after,
        .slotSkeleton::after {
          animation: none !important;
        }
      }
    `}</style>
  );
}
