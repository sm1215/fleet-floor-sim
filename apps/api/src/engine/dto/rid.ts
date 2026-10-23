/** `R` + an int, e.g. `R3` (commands.md). */
export const RID_PATTERN = /^R\d+$/;

export const RID_MESSAGE = 'rId must be an uppercase R followed by an int';

/** `R3` → 3. Assumes the DTO already matched RID_PATTERN. */
export function parseRId(rId: string): number {
  return Number(rId.slice(1));
}
