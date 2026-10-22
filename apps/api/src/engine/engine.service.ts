import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  OnModuleDestroy,
} from '@nestjs/common';
import type { NextCommand } from '../queue/next-command.js';
import { QueueService } from '../queue/queue.service.js';
import { EngineCommandsService } from './engine-commands.service.js';

export interface EngineState {
  currentTick: number;
  tickRate: number;
  running: boolean;
  /** Errors from automatic steps since the last read. */
  errors: string[];
}

export const STEP_WHILE_RUNNING =
  'Cannot step while the simulation is running. Pause it first.';

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Tick-based simulation engine. */
@Injectable()
export class EngineService implements OnModuleDestroy {
  currentTick = 0;
  tickRate = 1000;
  running = false;
  private errors: string[] = [];
  private timer: ReturnType<typeof setTimeout> | undefined;
  /** Bumped on every start/stop so a step from an earlier run never reschedules. */
  private run = 0;
  /** Settles once the current tick (manual or automatic) and its error reporting finish. */
  private inFlight: Promise<void> = Promise.resolve();

  constructor(
    private readonly queue: QueueService,
    private readonly commands: EngineCommandsService,
  ) {}

  /** Current state; the returned errors are cleared. */
  getState(): EngineState {
    const errors = this.errors;
    this.errors = [];
    return {
      currentTick: this.currentTick,
      tickRate: this.tickRate,
      running: this.running,
      errors,
    };
  }

  /** Manual steps are rejected while running so they never overlap automatic ones. */
  async step(): Promise<EngineState> {
    if (this.running) {
      throw new BadRequestException(STEP_WHILE_RUNNING);
    }
    const tick = this.advance();
    this.inFlight = tick.catch(() => undefined);
    try {
      await tick;
    } catch (error) {
      throw new InternalServerErrorException(errorMessage(error));
    }
    return this.getState();
  }

  /** Turns running on or off. */
  toggle(): EngineState {
    if (this.running) {
      this.stop();
    } else {
      this.running = true;
      this.run += 1;
      this.scheduleNext(this.run);
    }
    return this.getState();
  }

  /**
   * Stops running and returns to tick 0 with no pending errors. Waits for a
   * tick in progress first, so it never touches the DB after the reset.
   */
  async reset(): Promise<EngineState> {
    this.stop();
    await this.inFlight;
    this.currentTick = 0;
    this.errors = [];
    return this.getState();
  }

  onModuleDestroy(): void {
    this.stop();
  }

  /**
   * Advances one tick: waits for every robot's queue result, applies LEFT /
   * RIGHT, then resolves all MOVEs together.
   */
  private async advance(): Promise<void> {
    this.currentTick += 1;
    const taken = await Promise.all(await this.queue.doNext());
    const next = taken.filter((item): item is NextCommand => item !== null);
    for (const { robot, command } of next) {
      if (command === 'LEFT') await this.commands.left(robot.id);
      if (command === 'RIGHT') await this.commands.right(robot.id);
    }
    // Block reasons are returned but not reported anywhere yet.
    await this.commands.moveAll(
      next
        .filter((item) => item.command === 'MOVE')
        .map((item) => item.robot.id),
    );
  }

  private stop(): void {
    this.running = false;
    this.run += 1;
    clearTimeout(this.timer);
    this.timer = undefined;
  }

  /** The next tick is scheduled after the current step settles, so steps never overlap. */
  private scheduleNext(run: number): void {
    this.timer = setTimeout(() => {
      this.inFlight = this.runTick(run);
    }, this.tickRate);
  }

  private async runTick(run: number): Promise<void> {
    try {
      await this.advance();
    } catch (error) {
      this.errors.push(errorMessage(error));
    }
    if (this.running && run === this.run) this.scheduleNext(run);
  }
}
