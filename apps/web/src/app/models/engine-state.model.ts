export interface EngineState {
  /** The active floor; null when there is none. */
  floorId: number | null;
  /** The active floor's tick. */
  currentTick: number;
  tickRate: number;
  running: boolean;
  /** Errors from automatic steps since the last read. */
  errors: string[];
}
