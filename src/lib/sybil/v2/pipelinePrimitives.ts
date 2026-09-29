export function safePositiveBlock(
  value: number | string | null,
): number | null {
  const parsed =
    typeof value === 'number'
      ? value
      : Number(value);

  return Number.isSafeInteger(parsed) &&
    parsed > 0
    ? parsed
    : null;
}

export function safeNonNegativeBlock(
  value:
    | number
    | string
    | null
    | undefined,
): number | null {
  if (
    value === null ||
    value === undefined ||
    (
      typeof value === 'string' &&
      value.trim() === ''
    )
  ) {
    return null;
  }

  const parsed =
    typeof value === 'number'
      ? value
      : Number(value);

  return Number.isSafeInteger(parsed) &&
    parsed >= 0
    ? parsed
    : null;
}

export function isFinalizedVoteCheckpoint({
  voteCompleted,
  voteBlock,
  finalizedBlock,
}: {
  voteCompleted: boolean;
  voteBlock:
    | number
    | string
    | null
    | undefined;
  finalizedBlock:
    | number
    | string
    | null
    | undefined;
}): boolean {
  if (!voteCompleted) {
    return false;
  }

  const parsedVoteBlock =
    safeNonNegativeBlock(voteBlock);
  const parsedFinalizedBlock =
    safeNonNegativeBlock(finalizedBlock);

  return (
    parsedVoteBlock !== null &&
    parsedFinalizedBlock !== null &&
    parsedFinalizedBlock >=
      parsedVoteBlock
  );
}

export function safeRevision(
  value:
    | number
    | string
    | null
    | undefined,
): number | null {
  const parsed =
    typeof value === 'number'
      ? value
      : Number(value);

  return Number.isSafeInteger(parsed) &&
    parsed >= 0
    ? parsed
    : null;
}

export function safeError(
  error: unknown,
): string {
  const message =
    error instanceof Error
      ? error.message
      : String(error);

  return message.slice(0, 1000);
}

export function normalizeWallet(
  value: string,
): string {
  return value.trim().toLowerCase();
}

export function unique<T>(
  values: T[],
): T[] {
  return [...new Set(values)];
}

export function intervalsSimilar(
  left: Array<number | string> | null,
  right: Array<number | string> | null,
): boolean {
  if (
    !left ||
    !right ||
    left.length === 0 ||
    left.length !== right.length
  ) {
    return false;
  }

  return left.every((value, index) => {
    const a = Number(value);
    const b = Number(right[index]);

    if (
      !Number.isFinite(a) ||
      !Number.isFinite(b)
    ) {
      return false;
    }

    const absolute = Math.abs(a - b);
    const relative =
      absolute /
      Math.max(60, a, b);

    return (
      absolute <= 600 &&
      relative <= 0.35
    );
  });
}

export function appOverlap(
  left: string[],
  right: string[],
): number {
  const a = new Set(left);
  const b = new Set(right);
  const union = new Set([...a, ...b]);

  if (union.size === 0) {
    return 0;
  }

  let intersection = 0;

  for (const value of a) {
    if (b.has(value)) {
      intersection += 1;
    }
  }

  return intersection / union.size;
}

export function hasHighSignal(
  signals: Array<{
    code: string;
    strength: string;
    score: number;
  }>,
  code: string,
): boolean {
  return signals.some(
    (signal) =>
      signal.code === code &&
      signal.strength === 'HIGH' &&
      signal.score > 0,
  );
}

export function sequentialWalletSwitchGapSeconds({
  leftFirstSeenAt,
  leftLastSeenAt,
  rightFirstSeenAt,
  rightLastSeenAt,
}: {
  leftFirstSeenAt: string;
  leftLastSeenAt: string;
  rightFirstSeenAt: string;
  rightLastSeenAt: string;
}): number | null {
  const leftFirst = Date.parse(leftFirstSeenAt);
  const leftLast = Date.parse(leftLastSeenAt);
  const rightFirst = Date.parse(rightFirstSeenAt);
  const rightLast = Date.parse(rightLastSeenAt);

  if (
    [leftFirst, leftLast, rightFirst, rightLast]
      .some((value) => Number.isNaN(value))
  ) {
    return null;
  }

  if (rightFirst >= leftLast) {
    return (rightFirst - leftLast) / 1000;
  }
  if (leftFirst >= rightLast) {
    return (leftFirst - rightLast) / 1000;
  }

  return 0;
}

export function safeEligibilityRound(
  value: unknown,
): number | null {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string' &&
          /^\d+$/.test(value)
        ? Number(value)
        : null;

  return (
    parsed !== null &&
    Number.isSafeInteger(parsed) &&
    parsed > 0
  )
    ? parsed
    : null;
}

