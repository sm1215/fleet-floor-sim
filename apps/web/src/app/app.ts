import { HttpErrorResponse } from '@angular/common/http';
import {
  Component,
  computed,
  DestroyRef,
  HostListener,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { interval, Subscription, switchMap } from 'rxjs';
import { Button } from './components/button/button';
import { Grid } from './components/grid/grid';
import { LogModal } from './components/log-modal/log-modal';
import { QueuePanel } from './components/queue-panel/queue-panel';
import { Timeline } from './components/timeline/timeline';
import { EngineState } from './models/engine-state.model';
import { Floor } from './models/floor.model';
import { CommandName, QueuedCommand } from './models/queued-command.model';
import { SimulationApiService } from './services/simulation-api.service';

function hasModifier(event: KeyboardEvent): boolean {
  return event.altKey || event.ctrlKey || event.metaKey || event.shiftKey;
}

function isTextField(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}

export const COMMAND_ERROR = 'Command failed to queue.';
export const DELETE_ERROR = 'Robot failed to delete.';
export const QUEUE_LOAD_ERROR = "Server can't be reached";
export const RESET_ERROR = 'Floor failed to reset.';
export const FORK_ERROR = 'Floor failed to fork.';
export const DELETE_FLOOR_ERROR = 'Floor failed to delete.';

/** The API's error message (e.g. a failed step), or the unreachable-server text. */
function serverMessage(error: unknown): string {
  const message: unknown = error instanceof HttpErrorResponse ? error.error?.message : undefined;
  return typeof message === 'string' ? message : QUEUE_LOAD_ERROR;
}

@Component({
  selector: 'app-root',
  imports: [Button, Grid, LogModal, QueuePanel, Timeline],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  private readonly api = inject(SimulationApiService);
  protected readonly grid = viewChild.required(Grid);

  protected readonly editMode = signal(false);
  protected readonly selectedRobotId = signal<number | null>(null);
  protected readonly queue = signal<QueuedCommand[]>([]);
  protected readonly logOpen = signal(false);
  /** Engine is playing; Step is disabled (the API also rejects it). */
  protected readonly running = signal(false);
  /** Last tick seen from the API; a change reloads the grid's robots and the queue panel. */
  protected readonly currentTick = signal(0);
  /** The viewed (active) floor. */
  protected readonly floorId = signal<number | null>(null);
  protected readonly floors = signal<Floor[]>([]);
  /** The past tick on the scrubber; null = live (timeline.md). */
  protected readonly viewTick = signal<number | null>(null);
  /** Viewing a past tick: everything that changes the floor is disabled. */
  protected readonly readOnly = computed(() => this.viewTick() !== null);
  protected readonly errors = signal<{ id: number; text: string }[]>([]);
  private nextErrorId = 1;
  private poll: Subscription | undefined;

  constructor() {
    // Picks up a server that is already running. A load failure is already reported by the grid.
    this.api.getEngine().subscribe({
      next: (state) => this.applyEngineState(state),
      error: () => undefined,
    });
    inject(DestroyRef).onDestroy(() => this.stopPolling());
  }

  @HostListener('document:keydown', ['$event'])
  onKeydown(event: KeyboardEvent): void {
    if (this.logOpen() || this.readOnly() || hasModifier(event) || isTextField(event.target)) {
      return;
    }
    const handler = this.arrowKeyHandlers[event.key];
    if (handler) {
      event.preventDefault();
      handler();
    }
  }

  private readonly arrowKeyHandlers: Record<string, (() => void) | undefined> = {
    ArrowLeft: () => this.onTurnLeft(),
    ArrowRight: () => this.onTurnRight(),
    ArrowUp: () => this.onMove(),
  };

  addError(text: string): void {
    this.errors.update((errors) => [...errors, { id: this.nextErrorId++, text }]);
  }

  dismissError(id: number): void {
    this.errors.update((errors) => errors.filter((error) => error.id !== id));
  }

  clearErrors(): void {
    this.errors.set([]);
  }

  onStep(): void {
    this.api.stepEngine().subscribe({
      next: (state) => this.applyEngineState(state),
      error: (error: unknown) => this.addError(serverMessage(error)),
    });
  }

  onPlayPause(): void {
    this.api.toggleEngine().subscribe({
      next: (state) => this.applyEngineState(state),
      error: (error: unknown) => this.addError(serverMessage(error)),
    });
  }

  /**
   * After a Yes to the confirm, resets the floor; the API pauses the engine at tick 0.
   * The engine state is re-read either way, so Play / Pause matches the server.
   */
  onResetAll(): void {
    if (!window.confirm('Reset the entire floor?')) return;
    this.stopPolling();
    this.viewTick.set(null);
    this.grid()
      .resetFloor()
      .subscribe({
        next: () => {
          this.selectedRobotId.set(null);
          this.queue.set([]);
          this.refreshEngine();
        },
        error: () => {
          this.addError(RESET_ERROR);
          this.refreshEngine();
        },
      });
  }

  /** Delete Floor (timeline.md): after a Yes, deletes the viewed floor and shows the active one. */
  onDeleteFloor(): void {
    const floorId = this.floorId();
    if (floorId === null || !window.confirm('Delete this floor?')) return;
    this.api.deleteFloor(floorId).subscribe({
      next: (state) => {
        this.clearSelection();
        this.viewTick.set(null);
        this.applyEngineState(state);
        this.refreshFloors();
      },
      error: () => this.addError(DELETE_FLOOR_ERROR),
    });
  }

  /** Fork From Here: forks the viewed floor at the scrubber's tick, then shows the fork live. */
  onFork(tick: number): void {
    const floorId = this.floorId();
    if (floorId === null) return;
    this.api.forkFloor(floorId, tick).subscribe({
      next: () => {
        this.clearSelection();
        this.viewTick.set(null);
        this.refreshEngine();
      },
      error: () => this.addError(FORK_ERROR),
    });
  }

  /** The dropdown: makes that floor active (the engine pauses) and shows it live. */
  onFloorSelected(floorId: number): void {
    this.api.selectFloor(floorId).subscribe({
      next: (state) => {
        this.clearSelection();
        this.viewTick.set(null);
        this.applyEngineState(state);
      },
      error: () => this.addError(QUEUE_LOAD_ERROR),
    });
  }

  /** The scrubber moved; back at live, the selected robot's queue is re-read. */
  onViewTickChange(tick: number | null): void {
    this.viewTick.set(tick);
    if (tick === null) {
      // A robot that exists only in the past (negative id, see toLoadedState) is gone live.
      const id = this.selectedRobotId();
      if (id !== null && id < 0) this.clearSelection();
      this.reloadQueue();
    }
  }

  /** A past tick is shown: the queue panel shows the selected robot's queue at that tick. */
  onHistoryShown(): void {
    const id = this.selectedRobotId();
    if (id !== null) this.queue.set(this.grid().historyQueue(id));
  }

  /** Every live floor shown: the first one tells App the floor id; the list may have changed. */
  onFloorShown(floor: Floor): void {
    if (this.floorId() === null) this.floorId.set(floor.id);
    this.refreshFloors();
  }

  private refreshFloors(): void {
    this.api.getFloors().subscribe({
      next: (floors) => this.floors.set(floors),
      error: () => this.addError(QUEUE_LOAD_ERROR),
    });
  }

  private clearSelection(): void {
    this.selectedRobotId.set(null);
    this.queue.set([]);
  }

  private refreshEngine(): void {
    this.api.getEngine().subscribe({
      next: (state) => this.applyEngineState(state),
      error: () => this.addError(QUEUE_LOAD_ERROR),
    });
  }

  /** Shows errors from automatic steps and polls GET /engine every tickRate ms while running. */
  private applyEngineState(state: EngineState): void {
    for (const text of state.errors) this.addError(text);
    this.running.set(state.running);
    this.floorId.set(state.floorId);
    if (state.currentTick !== this.currentTick()) {
      this.currentTick.set(state.currentTick);
      this.reloadQueue();
    }
    if (!state.running) {
      this.stopPolling();
    } else if (!this.poll) {
      this.poll = interval(state.tickRate)
        .pipe(switchMap(() => this.api.getEngine()))
        .subscribe({
          next: (polled) => this.applyEngineState(polled),
          error: () => {
            this.poll = undefined;
            this.addError(QUEUE_LOAD_ERROR);
          },
        });
    }
  }

  /** Reloads the selected robot's queue; a tick takes its head command. Live only. */
  private reloadQueue(): void {
    const id = this.selectedRobotId();
    if (id === null || this.readOnly()) return;
    this.api.getQueuedCommands(id).subscribe({
      next: (commands) => {
        if (this.selectedRobotId() === id) this.queue.set(commands);
      },
      error: () => this.addError(QUEUE_LOAD_ERROR),
    });
  }

  private stopPolling(): void {
    this.poll?.unsubscribe();
    this.poll = undefined;
  }

  onToggleEdit(): void {
    this.editMode.update((on) => !on);
  }

  /** Selects a robot and loads its queue; clicking the selected robot deselects it. */
  onRobotClicked(id: number): void {
    this.queue.set([]);
    if (this.selectedRobotId() === id) {
      this.selectedRobotId.set(null);
      return;
    }
    this.selectedRobotId.set(id);
    if (this.readOnly()) {
      this.queue.set(this.grid().historyQueue(id));
      return;
    }
    this.api.getQueuedCommands(id).subscribe({
      next: (commands) => {
        if (this.selectedRobotId() === id) this.queue.set(commands);
      },
      error: () => this.addError(QUEUE_LOAD_ERROR),
    });
  }

  /** The modal loads the log each time it opens. */
  onOpenLog(): void {
    this.logOpen.set(true);
  }

  onCloseLog(): void {
    this.logOpen.set(false);
  }

  onTurnLeft(): void {
    this.sendCommand('LEFT');
  }

  onTurnRight(): void {
    this.sendCommand('RIGHT');
  }

  onMove(): void {
    this.sendCommand('MOVE');
  }

  /** Deletes the selected robot; on success it leaves the grid and the selection clears. */
  onDelete(): void {
    const id = this.selectedRobotId();
    const robot = id === null ? undefined : this.grid().findRobot(id);
    if (id === null || !robot || this.readOnly()) return;
    this.api.deleteCommand(robot.displayId).subscribe({
      next: () => {
        this.grid().removeRobot(id);
        if (this.selectedRobotId() === id) {
          this.selectedRobotId.set(null);
          this.queue.set([]);
        }
      },
      error: () => this.addError(DELETE_ERROR),
    });
  }

  /** Queues a command for the selected robot, then refetches its queue; does nothing with no selection. */
  private sendCommand(command: CommandName): void {
    const id = this.selectedRobotId();
    const robot = id === null ? undefined : this.grid().findRobot(id);
    if (id === null || !robot || this.readOnly()) return;
    this.api.queueCommand(robot.displayId, command).subscribe({
      next: () => {
        if (this.selectedRobotId() === id) this.reloadQueue();
      },
      error: () => this.addError(COMMAND_ERROR),
    });
  }
}
