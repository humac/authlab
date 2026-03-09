export type ClaimsDiffStatus = "added" | "removed" | "changed" | "unchanged";

export interface ClaimsDiffEntry {
  key: string;
  currentValue: string | null;
  compareValue: string | null;
  status: ClaimsDiffStatus;
}

function stableSerialize(value: unknown): string {
  if (value === null || value === undefined) {
    return "null";
  }

  if (Array.isArray(value)) {
    return JSON.stringify(value.map(sortNestedValue), null, 2);
  }

  if (typeof value === "object") {
    return JSON.stringify(sortNestedValue(value), null, 2);
  }

  return String(value);
}

function sortNestedValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortNestedValue);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, sortNestedValue(nested)]),
    );
  }

  return value;
}

export function buildClaimsDiffEntries(
  currentClaims: Record<string, unknown>,
  compareClaims: Record<string, unknown>,
): ClaimsDiffEntry[] {
  const keys = Array.from(
    new Set([...Object.keys(currentClaims), ...Object.keys(compareClaims)]),
  ).sort((left, right) => left.localeCompare(right));

  return keys.map((key) => {
    const hasCurrent = Object.hasOwn(currentClaims, key);
    const hasCompare = Object.hasOwn(compareClaims, key);
    const currentValue = hasCurrent ? stableSerialize(currentClaims[key]) : null;
    const compareValue = hasCompare ? stableSerialize(compareClaims[key]) : null;

    let status: ClaimsDiffStatus;
    if (!hasCompare) {
      status = "added";
    } else if (!hasCurrent) {
      status = "removed";
    } else if (currentValue !== compareValue) {
      status = "changed";
    } else {
      status = "unchanged";
    }

    return {
      key,
      currentValue,
      compareValue,
      status,
    };
  });
}

