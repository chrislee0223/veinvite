'use client';

/**
 * Placeholder styling is intentionally non-authoritative. The global startup
 * fail-safe keeps referral/link hydration placeholders hidden so an incomplete
 * wallet Home can never flash between the VeInvite shield and real Home data.
 */
export function StartupHydrationPlaceholders() {
  return (
    <style jsx global>{`
      .slotsSkeleton {
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
