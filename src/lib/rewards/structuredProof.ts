export type StructuredRewardProofExpectation = {
  proofText: string;
  proofLink: string;
  description: string;
};

export type StructuredRewardProofMatchResult =
  | 'match'
  | 'invalid-json'
  | 'mismatch';

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value)
  );
}

export function matchStructuredRewardProof(
  rawProof: string,
  expected: StructuredRewardProofExpectation,
): StructuredRewardProofMatchResult {
  let parsed: unknown;

  try {
    parsed = JSON.parse(rawProof);
  } catch {
    return 'invalid-json';
  }

  if (!isRecord(parsed)) {
    return 'mismatch';
  }

  const proof = parsed.proof;

  if (
    parsed.version !== 2 ||
    parsed.description !== expected.description ||
    !isRecord(proof) ||
    proof.text !== expected.proofText ||
    proof.link !== expected.proofLink ||
    Object.prototype.hasOwnProperty.call(parsed, 'impact')
  ) {
    return 'mismatch';
  }

  return 'match';
}
