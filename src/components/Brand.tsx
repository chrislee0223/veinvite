import Image from 'next/image';

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <span className={compact ? 'brand brandCompact' : 'brand'} aria-label="VeInvite">
      <Image
        src="/veinvite-logo.webp"
        alt=""
        width={compact ? 32 : 38}
        height={compact ? 32 : 38}
        priority={!compact}
      />
      <span className="brandName">
        Ve<span>Invite</span>
      </span>
    </span>
  );
}

export function Mascot() {
  return (
    <div className="mascot" aria-hidden="true">
      <div className="helmet">
        <span className="eye eyeOne" />
        <span className="eye eyeTwo" />
      </div>
      <div className="mascotBadge">Vi</div>
    </div>
  );
}
