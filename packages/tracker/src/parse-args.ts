/**
 * Parse CLI proposal arguments into a sorted, deduplicated array of proposal IDs.
 *
 * Accepts:
 *   - Single IDs: "528" → [528]
 *   - Ranges: "525-530" → [525, 526, 527, 528, 529, 530]
 *   - Mixed: ["519", "525-528", "540"] → [519, 525, 526, 527, 528, 540]
 */
export function parseProposalArgs(args: string[]): number[] {
  const ids = new Set<number>();

  for (const arg of args) {
    const rangeMatch = arg.match(/^(\d+)-(\d+)$/);
    if (rangeMatch) {
      const start = Number(rangeMatch[1]);
      const end = Number(rangeMatch[2]);
      if (start > end) {
        throw new Error(`Invalid range "${arg}": start must be ≤ end`);
      }
      for (let i = start; i <= end; i++) {
        ids.add(i);
      }
    } else if (/^\d+$/.test(arg)) {
      ids.add(Number(arg));
    } else {
      throw new Error(`Invalid proposal argument "${arg}": expected a number or range (e.g., 525-530)`);
    }
  }

  if (ids.size === 0) {
    throw new Error("No proposal IDs provided");
  }

  return [...ids].sort((a, b) => a - b);
}
