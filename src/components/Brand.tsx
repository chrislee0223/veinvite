export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <span className={compact ? 'brand brandCompact' : 'brand'} aria-label="VeInvite">
      <span>Ve</span>Invite
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
