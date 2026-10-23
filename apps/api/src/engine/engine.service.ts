import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { Floor, LogEntry } from '../../database/entities/index.js';
import { deleteFloorContents } from '../floor/floor-writes.js';
import {
  DEFAULT_FLOOR_HEIGHT,
  DEFAULT_FLOOR_WIDTH,
} from '../floor/floor.model.js';
import type { FloorState } from '../history/floor-state.js';
import { HistoryService } from '../history/history.service.js';
import { type LogLine, unreachableParams } from '../log-entry/log-params.js';
import { LogEntryService } from '../log-entry/log-entry.service.js';
import type { NextCommand } from '../queue/next-command.js';
import { QueueService } from '../queue/queue.service.js';
import type { Command, Direction } from '../shared/types.js';
import { WriteLock } from '../shared/write-lock.js';
import type { CommandResult, Recorder } from './command-result.js';
import { DirectCommandsService } from './direct-commands.service.js';
import { EngineCommandsService } from './engine-commands.service.js';

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

/** No-path ticks in a row after which a GOTO gives up (pathfinding.md). */
export const GOTO_NO_PATH_LIMIT = 3;

/** Most steps a single TICK may run. */
export const MAX_TICK_AMOUNT = 99;

export const NO_FLOOR = 'No floor';

export const STEP_WHILE_RUNNING =
  'Cannot step while the simulation is running. Pause it first.';

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Tick-based simulation engine over the active floor (timeline.md). */
@Injectable()
export class EngineService implements OnModuleInit, OnModuleDestroy {
  /** The active floor: commands and ticks act on it. */
  floorId: number | null = null;
  /** A snapshot is saved at the start of every tick that is a multiple of this. */
  snapshotFrequency = 10;
  tickRate = 1000;
  running = false;
  /** Set by the scenario runner. */
  scenarioMode = false;
  private errors: string[] = [];
  /** Each floor's tick; a floor not in the map is at tick 0. */
  private readonly ticks = new Map<number, number>();
  /**
   * Per floor: no-path ticks in a row of each pending GOTO, keyed by
   * queued-command id. Replaced only when a tick commits.
   */
  private readonly noPathTicks = new Map<number, Map<number, number>>();
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
    private readonly logEntries: LogEntryService,
    private readonly dataSource: DataSource,
    private readonly historyService: HistoryService,
  ) {}

  /** The active floor's tick, 0 when there is none. */
  get currentTick(): number {
    return this.floorId === null ? 0 : this.tickOf(this.floorId);
  }

  tickOf(floorId: number): number {
    return this.ticks.get(floorId) ?? 0;
  }

  setTick(floorId: number, tick: number): void {
    this.ticks.set(floorId, tick);
  }

  /** Loads each floor's tick from its log; the lowest floor id is active. */
  async onModuleInit(): Promise<void> {
    const floors = await this.dataSource
      .getRepository(Floor)
      .find({ select: { id: true }, order: { id: 'ASC' } });
    const rows = await this.dataSource
      .getRepository(LogEntry)
      .createQueryBuilder('entry')
      .select('entry.floor_id', 'floorId')
      .addSelect('MAX(entry.tick)', 'tick')
      .groupBy('entry.floor_id')
      .getRawMany<{ floorId: number | null; tick: number }>();
    for (const { floorId, tick } of rows) {
      if (floorId !== null) this.setTick(floorId, tick);
    }
    this.floorId = floors[0]?.id ?? null;
  }

  /** Makes the floor active and pauses. Unknown floor → ignored. */
  async selectFloor(floorId: number): Promise<CommandResult> {
    const exists = await this.dataSource
      .getRepository(Floor)
      .existsBy({ id: floorId });
    if (!exists) return { ok: false, reason: `Floor ${floorId} not found` };
    this.stop();
    this.floorId = floorId;
    return { ok: true };
  }

  /**
   * The floor at a past or current tick (timeline.md). Runs under the write
   * lock, so it never sees a half-written tick.
   */
  history(
    floorId: number,
    tick: number,
  ): Promise<{ ok: true; state: FloorState } | { ok: false; reason: string }> {
    return this.lock.run(async () => {
      const manager = this.dataSource.manager;
      const reason = await this.checkTick(manager, floorId, tick);
      if (reason) return { ok: false, reason };
      const state = await this.historyService.stateAt(
        manager,
        floorId,
        tick,
        this.tickOf(floorId),
      );
      return state
        ? { ok: true, state }
        : { ok: false, reason: `No history for tick ${tick}` };
    });
  }

  /**
   * Fork From Here (timeline.md): a new floor whose history matches this one
   * up to `tick`. Writes no log entry. The new floor becomes active at `tick`
   * and the engine pauses.
   */
  fork(
    floorId: number,
    tick: number,
  ): Promise<{ ok: true; floorId: number } | { ok: false; reason: string }> {
    return this.lock.run(async () => {
      const forked = await this.dataSource.transaction(async (manager) => {
        const reason = await this.checkTick(manager, floorId, tick);
        if (reason) return { ok: false as const, reason };
        const id = await this.historyService.fork(
          manager,
          floorId,
          tick,
          this.tickOf(floorId),
        );
        return id === null
          ? { ok: false as const, reason: `No history for tick ${tick}` }
          : { ok: true as const, floorId: id };
      });
      if (forked.ok) {
        this.setTick(forked.floorId, tick);
        this.stop();
        this.floorId = forked.floorId;
      }
      return forked;
    });
  }

  /**
   * Delete Floor (timeline.md): pauses, then deletes the floor and everything
   * on it. If it was active, the lowest remaining floor becomes active; if it
   * was the last floor, a new default floor is created and made active.
   */
  async deleteFloor(floorId: number): Promise<CommandResult> {
    const exists = await this.dataSource
      .getRepository(Floor)
      .existsBy({ id: floorId });
    if (!exists) return { ok: false, reason: `Floor ${floorId} not found` };
    this.stop();
    await this.inFlight;
    const remaining = await this.lock.run(() =>
      this.dataSource.transaction(async (manager) => {
        await deleteFloorContents(manager, floorId);
        await manager.getRepository(Floor).delete(floorId);
        return manager
          .getRepository(Floor)
          .findOne({ where: {}, order: { id: 'ASC' } });
      }),
    );
    this.ticks.delete(floorId);
    this.noPathTicks.delete(floorId);
    if (this.floorId === floorId) this.floorId = remaining?.id ?? null;
    if (this.floorId === null) {
      await this.floor(DEFAULT_FLOOR_WIDTH, DEFAULT_FLOOR_HEIGHT);
    }
    return { ok: true };
  }

  /** The reason a floor/tick pair is ignored, or null when it is valid. */
  private async checkTick(
    manager: EntityManager,
    floorId: number,
    tick: number,
  ): Promise<string | null> {
    if (!(await manager.getRepository(Floor).existsBy({ id: floorId }))) {
      return `Floor ${floorId} not found`;
    }
    const currentTick = this.tickOf(floorId);
    if (!Number.isInteger(tick) || tick < 0 || tick > currentTick) {
      return `Tick must be an int from 0 to ${currentTick}`;
    }
    return null;
  }

  /** Current state; the returned errors are cleared. */
  getState(): EngineState {
    const errors = this.errors;
    this.errors = [];
    return {
      floorId: this.floorId,
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
    if (this.floorId === null) throw new BadRequestException(NO_FLOOR);
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
    if (this.floorId === null) return { ok: false, reason: NO_FLOOR };
    try {
      for (let i = 0; i < amount; i++) await this.step();
    } catch (error) {
      return { ok: false, reason: errorMessage(error) };
    }
    return { ok: true };
  }

  // Commands write their entry inside their own transaction (`record`): a
  // failed write rolls the command back, and the entry lands under the lock.

  /** With no active floor, creates one and makes it active at tick 0. */
  async floor(width: number, height: number): Promise<CommandResult> {
    const result = await this.direct.floor(
      this.floorId,
      width,
      height,
      this.record,
    );
    if (result.ok && result.log && this.floorId === null) {
      this.floorId = result.log.floorId;
      this.setTick(this.floorId, 0);
    }
    return result;
  }

  obstacle(x: number, y: number): Promise<CommandResult> {
    return this.direct.obstacle(this.floorId, x, y, this.record);
  }

  /** Without a displayId, places a new robot (displayId = floor's highest + 1). */
  place(
    displayId: number | undefined,
    x: number,
    y: number,
    direction: Direction,
  ): Promise<CommandResult> {
    return this.direct.place(
      this.floorId,
      displayId,
      x,
      y,
      direction,
      this.record,
    );
  }

  queue(displayId: number, commands: Command[]): Promise<CommandResult> {
    return this.direct.queue(this.floorId, displayId, commands, this.record);
  }

  goto(displayId: number, x: number, y: number): Promise<CommandResult> {
    return this.direct.goto(this.floorId, displayId, x, y, this.record);
  }

  delete(displayId: number): Promise<CommandResult> {
    return this.direct.delete(this.floorId, displayId, this.record);
  }

  /**
   * Writes one log entry inside the given transaction, unless running a
   * scenario (log-entry.md). `tick` defaults to the floor's current tick.
   */
  async log(
    manager: EntityManager,
    { floorId, action, params }: LogLine,
    result = 'OK',
    tick = this.tickOf(floorId),
  ): Promise<void> {
    if (this.scenarioMode) return;
    await this.logEntries.create(
      { floorId, tick, action, params, result },
      manager,
    );
  }

  private readonly record: Recorder = (manager, line) =>
    this.log(manager, line);

  report(): Promise<string[]> {
    return this.direct.report(this.floorId);
  }

  /** Removes every floor; no floor is active after. */
  async clear(): Promise<void> {
    await this.direct.clear();
    this.floorId = null;
    this.ticks.clear();
    this.noPathTicks.clear();
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
   * Stops running and returns the floor to tick 0 with no pending errors.
   * Waits for a tick in progress first, so it never touches the DB after the
   * reset.
   */
  async reset(floorId: number): Promise<EngineState> {
    this.stop();
    await this.inFlight;
    this.setTick(floorId, 0);
    this.noPathTicks.delete(floorId);
    this.errors = [];
    return this.getState();
  }

  onModuleDestroy(): void {
    this.stop();
  }

  /**
   * Advances the active floor one tick: waits for every robot's queue result,
   * applies LEFT / RIGHT, then resolves all MOVEs together. The tick and its
   * TICK entry commit together; on any failure nothing is saved and the tick
   * number stays where it was.
   */
  private advance(run?: number): Promise<void> {
    return this.lock.run(async () => {
      // An automatic tick from a run that was stopped while it waited (Fork,
      // floor switch, Pause) is dropped, so a paused floor never moves.
      if (run !== undefined && run !== this.run) return;
      // Read under the lock, so a floor switch while waiting ticks the new floor.
      const floorId = this.floorId;
      if (floorId === null) throw new Error(NO_FLOOR);
      const tick = this.tickOf(floorId) + 1;
      const noPathTicks = await this.dataSource.transaction((manager) =>
        this.applyTick(manager, floorId, tick),
      );
      this.setTick(floorId, tick);
      this.noPathTicks.set(floorId, noPathTicks);
    });
  }

  /** Returns the floor's next no-path counts, to keep once the tick commits. */
  private async applyTick(
    manager: EntityManager,
    floorId: number,
    tick: number,
  ): Promise<Map<number, number>> {
    // Holds the state at the tick being left, so replay can start from it.
    const from = tick - 1;
    if (!this.scenarioMode && from % this.snapshotFrequency === 0) {
      await this.historyService.snapshot(manager, floorId, from);
    }
    const taken = await Promise.all(
      await this.queueService.doNext(floorId, manager),
    );
    const next = taken.filter((item): item is NextCommand => item !== null);
    const { moverIds, arriving, noPathTicks } = await this.planGotos(
      manager,
      floorId,
      tick,
      next,
    );
    for (const { robot, command } of next) {
      if (command === 'LEFT') await this.commands.left(robot.id, manager);
      if (command === 'RIGHT') await this.commands.right(robot.id, manager);
      if (command === 'MOVE') moverIds.push(robot.id);
    }
    // Block reasons are returned but not reported anywhere yet.
    const blocked = await this.commands.moveAll(moverIds, manager);
    // A GOTO MOVE that reached its target finishes this tick.
    for (const [robotId, queuedCommandId] of arriving) {
      if (!blocked.some((block) => block.robotId === robotId)) {
        await this.queueService.remove(queuedCommandId, manager);
      }
    }
    await this.log(
      manager,
      { floorId, action: 'TICK', params: String(tick) },
      (await this.direct.report(floorId, manager)).join('\n'),
      tick,
    );
    return noPathTicks;
  }

  /**
   * One pathfinding step per GOTO head, in displayId order, before the tick's
   * MOVEs (pathfinding.md). Finished and given-up GOTOs are removed; robots
   * with a path join the MOVEs. `arriving` maps a robot whose step lands on
   * its target to its GOTO, removed once its MOVE succeeds.
   */
  private async planGotos(
    manager: EntityManager,
    floorId: number,
    tick: number,
    next: NextCommand[],
  ) {
    const previous = this.noPathTicks.get(floorId) ?? new Map<number, number>();
    const noPathTicks = new Map<number, number>();
    const moverIds: number[] = [];
    const arriving = new Map<number, number>();
    const gotos = next.filter((item) => item.command === 'GOTO');
    const steps =
      gotos.length === 0
        ? []
        : await this.commands.gotoSteps(
            floorId,
            gotos.map(({ robot, target }) => ({ robotId: robot.id, target })),
            manager,
          );
    for (const [i, { robot, queuedCommandId: id, target }] of gotos.entries()) {
      const step = steps[i];
      if (step.kind === 'ARRIVED') {
        await this.queueService.remove(id, manager);
      } else if (step.kind === 'NO_PATH') {
        const count = (previous.get(id) ?? 0) + 1;
        if (count < GOTO_NO_PATH_LIMIT) {
          noPathTicks.set(id, count);
        } else {
          await this.queueService.remove(id, manager);
          await this.log(
            manager,
            {
              floorId,
              action: 'UNREACHABLE',
              params: unreachableParams(robot.displayId, target.x, target.y),
            },
            'OK',
            tick,
          );
        }
      } else {
        moverIds.push(robot.id);
        if (step.next.x === target.x && step.next.y === target.y) {
          arriving.set(robot.id, id);
        }
      }
    }
    return { moverIds, arriving, noPathTicks };
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
      await this.advance(run);
    } catch (error) {
      this.errors.push(errorMessage(error));
    }
    if (this.running && run === this.run) this.scheduleNext(run);
  }
}
