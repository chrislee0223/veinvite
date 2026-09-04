'use client';

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
