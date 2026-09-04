import Image from 'next/image';

export function Brand({ compact = false }: { compact?: boolean }) {
  const size = 38;

  return (
    <div className={compact ? 'brand brandCompact' : 'brand'}>
      <Image
        src="/veinvite-logo.webp"
        width={size}
        height={size}
        alt="VeInvite"
        priority
        style={
          compact
            ? {
                width: size,
                height: size,
                minWidth: size,
                minHeight: size,
                maxWidth: size,
                maxHeight: size,
                flex: `0 0 ${size}px`,
                display: 'block',
                objectFit: 'cover',
                transition: 'none',
                transform: 'none',
                animation: 'none',
              }
            : undefined
        }
      />
      <span>
        <strong>Ve</strong>
        <b>Invite</b>
      </span>
    </div>
  );
}
