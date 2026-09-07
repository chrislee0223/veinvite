from pathlib import Path

path = Path('src/lib/rewards/automaticRewardPayout.ts')
source = path.read_text()

marker = """  if (payoutResult.error) {
    throw new Error(
      `Reward payouts could not be loaded: ${payoutResult.error.message}`,
    );
  }

"""

insertion = """  const exactSourceResult = await supabaseAdmin.rpc(
    'read_reward_manifest_source',
    {
      p_round_id: roundId,
    },
  );

  if (exactSourceResult.error) {
    throw new Error(
      `Exact reward manifest source could not be loaded: ${exactSourceResult.error.message}`,
    );
  }

  const exactSource = exactSourceResult.data as {
    round?: Record<string, unknown> | null;
    payouts?: Record<string, unknown>[];
    manifest?: Record<string, unknown> | null;
  } | null;

  if (
    !exactSource?.round ||
    !Array.isArray(exactSource.payouts)
  ) {
    throw new Error(
      'Exact reward manifest source returned malformed data.',
    );
  }

  if (
    positiveId(
      exactSource.round.id,
      'exact reward round id',
    ) !== roundId
  ) {
    throw new Error(
      'Exact reward manifest source resolved a different round.',
    );
  }

  const manifestRound: Record<string, unknown> = {
    ...round,
    ...exactSource.round,
  };
  const manifestPayouts = exactSource.payouts;

"""

if marker not in source:
    raise SystemExit('payout result marker not found')
source = source.replace(marker, marker + insertion, 1)

nested_return = """      round,
      payouts:
        (payoutResult.data ?? []) as Record<string, unknown>[],
"""
nested_replacement = """      round: manifestRound,
      payouts: manifestPayouts,
"""
final_return = """    round,
    payouts:
      (payoutResult.data ?? []) as Record<string, unknown>[],
"""
final_replacement = """    round: manifestRound,
    payouts: manifestPayouts,
"""

if source.count(nested_return) != 1:
    raise SystemExit(
        f'expected 1 nested reward-state return block, found {source.count(nested_return)}'
    )
if source.count(final_return) != 1:
    raise SystemExit(
        f'expected 1 final reward-state return block, found {source.count(final_return)}'
    )
source = source.replace(nested_return, nested_replacement, 1)
source = source.replace(final_return, final_replacement, 1)

old_manifest = """  const manifest =
    manifestResult.data as Record<string, unknown> | null;

"""
new_manifest = """  const baseManifest =
    manifestResult.data as Record<string, unknown> | null;
  const exactManifest = exactSource.manifest ?? null;

  if (Boolean(baseManifest) !== Boolean(exactManifest)) {
    throw new Error(
      'Exact reward manifest source disagrees with the active manifest state.',
    );
  }

  const manifest = baseManifest && exactManifest
    ? {
        ...baseManifest,
        ...exactManifest,
      }
    : null;

"""

if old_manifest not in source:
    raise SystemExit('manifest marker not found')
source = source.replace(old_manifest, new_manifest, 1)

path.write_text(source)
