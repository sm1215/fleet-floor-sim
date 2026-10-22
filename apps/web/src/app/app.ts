import { Component, HostListener, inject, signal } from '@angular/core';
import { Button } from './components/button/button';
import { Grid } from './components/grid/grid';
import { LogModal } from './components/log-modal/log-modal';
import { QueuePanel } from './components/queue-panel/queue-panel';
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
export const QUEUE_LOAD_ERROR = "Server can't be reached";

@Component({
  selector: 'app-root',
  imports: [Button, Grid, LogModal, QueuePanel],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  private readonly api = inject(SimulationApiService);

  protected readonly editMode = signal(false);
  protected readonly selectedRobotId = signal<number | null>(null);
  protected readonly queue = signal<QueuedCommand[]>([]);
  protected readonly logOpen = signal(false);
  protected readonly errors = signal<{ id: number; text: string }[]>([]);
  private nextErrorId = 1;

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
    // Stub. Target: API.
  }

  onPlayPause(): void {
    // Stub. Target: API.
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
