import { Direction, DIRECTION_NAMES } from '../shared/types.js';

export interface ReportRobot {
  displayId: number;
  x: number;
  y: number;
  direction: Direction;
}

/** One `R<id> x,y,DIRECTION` line per robot by ascending displayId, or `EMPTY`. */
export function formatReport(robots: ReportRobot[]): string[] {
  if (robots.length === 0) return ['EMPTY'];
  return [...robots]
    .sort((a, b) => a.displayId - b.displayId)
    .map(
      (r) => `R${r.displayId} ${r.x},${r.y},${DIRECTION_NAMES[r.direction]}`,
    );
}
