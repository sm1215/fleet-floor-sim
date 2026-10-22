import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  OnModuleDestroy,
} from '@nestjs/common';
import type { NextCommand } from '../queue/next-command.js';
import { QueueService } from '../queue/queue.service.js';
import type { Command, Direction } from '../shared/types.js';
import { WriteLock } from '../shared/write-lock.js';
import type { CommandResult } from './command-result.js';
import { DirectCommandsService } from './direct-commands.service.js';
import { EngineCommandsService } from './engine-commands.service.js';

export interface EngineState {
  currentTick: number;
  tickRate: number;
  running: boolean;
  /** Errors from automatic steps since the last read. */
  errors: string[];
}

/** Most steps a single TICK may run. */
export const MAX_TICK_AMOUNT = 99;

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
  /** Set by the scenario runner. */
  scenarioMode = false;
  private errors: string[] = [];
  private timer: ReturnType<typeof setTimeout> | undefined;
  /** Bumped on every start/stop so a step from an earlier run never reschedules. */
  private run = 0;
  /** Settles once the current tick (manual or automatic) and its error reporting finish. */
  private inFlight: Promise<void> = Promise.resolve();

  constructor(
    private readonly queueService: QueueService,
    private readonly commands: EngineCommandsService,
    private readonly direct: DirectCommandsService,
    private readonly lock: WriteLock,
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

  /**
   * Steps `amount` times (an int from 1 to MAX_TICK_AMOUNT). Ignored while
   * running. A failing step stops the rest and is returned, never thrown.
   */
  async tick(amount = 1): Promise<CommandResult> {
    if (!Number.isInteger(amount) || amount < 1 || amount > MAX_TICK_AMOUNT) {
      return {
        ok: false,
        reason: `Tick amount must be an int from 1 to ${MAX_TICK_AMOUNT}`,
      };
    }
    if (this.running) return { ok: false, reason: STEP_WHILE_RUNNING };
    try {
      for (let i = 0; i < amount; i++) await this.step();
    } catch (error) {
      return { ok: false, reason: errorMessage(error) };
    }
    return { ok: true };
  }

  floor(width: number, height: number): Promise<CommandResult> {
    return this.direct.floor(width, height);
  }

  obstacle(x: number, y: number): Promise<CommandResult> {
    return this.direct.obstacle(x, y);
  }

  place(
    displayId: number,
    x: number,
    y: number,
    direction: Direction,
  ): Promise<CommandResult> {
    return this.direct.place(displayId, x, y, direction);
  }

  queue(displayId: number, commands: Command[]): Promise<CommandResult> {
    return this.direct.queue(displayId, commands);
  }

  report(): Promise<string[]> {
    return this.direct.report();
  }

  clear(): Promise<void> {
    return this.direct.clear();
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
  private advance(): Promise<void> {
    return this.lock.run(() => this.applyTick());
  }

  private async applyTick(): Promise<void> {
    this.currentTick += 1;
    const taken = await Promise.all(await this.queueService.doNext());
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
