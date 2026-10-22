import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, HostListener, inject, signal, viewChild } from '@angular/core';
import { interval, Subscription, switchMap } from 'rxjs';
import { Button } from './components/button/button';
import { Grid } from './components/grid/grid';
import { LogModal } from './components/log-modal/log-modal';
import { QueuePanel } from './components/queue-panel/queue-panel';
import { EngineState } from './models/engine-state.model';
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

/** The API's error message (e.g. a failed step), or the unreachable-server text. */
function serverMessage(error: unknown): string {
  const message: unknown = error instanceof HttpErrorResponse ? error.error?.message : undefined;
  return typeof message === 'string' ? message : QUEUE_LOAD_ERROR;
}

@Component({
  selector: 'app-root',
  imports: [Button, Grid, LogModal, QueuePanel],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  private readonly api = inject(SimulationApiService);
  private readonly grid = viewChild.required(Grid);

  protected readonly editMode = signal(false);
  protected readonly selectedRobotId = signal<number | null>(null);
  protected readonly queue = signal<QueuedCommand[]>([]);
  protected readonly logOpen = signal(false);
  /** Engine is playing; Step is disabled (the API also rejects it). */
  protected readonly running = signal(false);
  /** Last tick seen from the API; a change reloads the grid's robots and the queue panel. */
  protected readonly currentTick = signal(0);
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
    if (this.logOpen() || hasModifier(event) || isTextField(event.target)) {
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

  /** Reloads the selected robot's queue; a tick takes its head command. */
  private reloadQueue(): void {
    const id = this.selectedRobotId();
    if (id === null) return;
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
    this.api.getQueuedCommands(id).subscribe({
      next: (commands) => {
        if (this.selectedRobotId() === id) this.queue.set(commands);
      },
      error: () => this.addError(QUEUE_LOAD_ERROR),
    });
  }

  onOpenLog(): void {
    // Opens the modal (frontend). Target for loading the log: API / Frontend, TBD.
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
    if (id === null) return;
    this.api.deleteRobot(id).subscribe({
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

  /** Queues a command for the selected robot; does nothing with no selection. */
  private sendCommand(command: CommandName): void {
    const id = this.selectedRobotId();
    if (id === null) return;
    this.api.createQueuedCommand(id, command).subscribe({
      next: (queued) => {
        if (this.selectedRobotId() === id) this.queue.update((queue) => [...queue, queued]);
      },
      error: () => this.addError(COMMAND_ERROR),
    });
  }
}
