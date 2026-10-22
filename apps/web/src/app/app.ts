import { Component, HostListener, signal } from '@angular/core';
import { Button } from './components/button/button';
import { Grid } from './components/grid/grid';
import { LogModal } from './components/log-modal/log-modal';
import { QueuePanel } from './components/queue-panel/queue-panel';
import { QueuedCommand } from './models/queued-command.model';
import { Robot } from './models/robot.model';

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

@Component({
  selector: 'app-root',
  imports: [Button, Grid, LogModal, QueuePanel],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  protected readonly robots = signal<Robot[]>([]);
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
    // Stub. Target: Frontend.
  }

  onOpenLog(): void {
    // Opens the modal (frontend). Target for loading the log: API / Frontend, TBD.
    this.logOpen.set(true);
  }

  onCloseLog(): void {
    this.logOpen.set(false);
  }

  onTurnLeft(): void {
    // Stub. Target: API / Frontend, TBD.
  }

  onTurnRight(): void {
    // Stub. Target: API / Frontend, TBD.
  }

  onMove(): void {
    // Stub. Target: API / Frontend, TBD.
  }
}
