import { doNext } from '../queue/do-next.js';

/** Tick-based simulation engine. Free of HTTP concerns. */
export class Engine {
  currentTick = 0;
  tickRate = 1000;
  running = false;
  private timer: ReturnType<typeof setTimeout> | undefined;
  /** Bumped on every start/stop so a step from an earlier run never reschedules. */
  private run = 0;

  /** `onError` receives errors from steps run automatically while running. */
  constructor(private readonly onError: (error: unknown) => void = () => {}) {}

  /** Advances one tick and waits for the queue to finish. Errors propagate. */
  async step(): Promise<void> {
    this.currentTick += 1;
    await doNext();
  }

  /** Turns running on or off. */
  toggle(): void {
    if (this.running) {
      this.stop();
    } else {
      this.running = true;
      this.run += 1;
      this.scheduleNext(this.run);
    }
  }

  stop(): void {
    this.running = false;
    this.run += 1;
    clearTimeout(this.timer);
    this.timer = undefined;
  }

  /** The next tick is scheduled after the current step settles, so steps never overlap. */
  private scheduleNext(run: number): void {
    this.timer = setTimeout(() => void this.runTick(run), this.tickRate);
  }

  private async runTick(run: number): Promise<void> {
    try {
      await this.step();
    } catch (error) {
      this.onError(error);
    }
    if (this.running && run === this.run) this.scheduleNext(run);
  }
}
