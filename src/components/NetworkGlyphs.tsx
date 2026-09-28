export function LayoutControlGlyph({ done = false }: { done?: boolean }) {
  if (done) {
    return (
      <svg width="14" height="14" viewBox="0 0 20 20" fill="none" aria-hidden="true">
        <path d="m4 10.4 3.4 3.4L16 5.8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  return (
    <svg width="14" height="14" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M10 2.8v14.4M2.8 10h14.4M10 2.8 7.8 5M10 2.8 12.2 5M10 17.2 7.8 15M10 17.2 12.2 15M2.8 10 5 7.8M2.8 10 5 12.2M17.2 10 15 7.8M17.2 10 15 12.2" stroke="currentColor" strokeWidth="1.45" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function GroupsControlGlyph({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <circle cx="10" cy="5" r="2" stroke="currentColor" strokeWidth="1.45" />
      <circle cx="5" cy="14" r="2" stroke="currentColor" strokeWidth="1.45" />
      <circle cx="15" cy="14" r="2" stroke="currentColor" strokeWidth="1.45" />
      <path d="M8.8 6.7 6.2 12M11.2 6.7l2.6 5.3M7 14h6" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" />
    </svg>
  );
}

export function SearchGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <circle cx="8.5" cy="8.5" r="4.8" stroke="currentColor" strokeWidth="1.6" />
      <path d="m12.2 12.2 4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function NetworkCountGlyph() {
  return (
    <svg width="10" height="10" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <circle cx="10" cy="4.5" r="1.8" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="5" cy="14.5" r="1.8" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="15" cy="14.5" r="1.8" stroke="currentColor" strokeWidth="1.4" />
      <path d="M9 6 6 12.7M11 6l3 6.7M6.8 14.5h6.4" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
    </svg>
  );
}

export function NetworkGlyph({ size = 32 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="5" r="2.2" />
      <circle cx="6" cy="17" r="2.2" />
      <circle cx="18" cy="17" r="2.2" />
      <path d="M10.8 6.9 7.2 15" />
      <path d="m13.2 6.9 3.6 8.1" />
      <path d="M8.2 17h7.6" />
    </svg>
  );
}
