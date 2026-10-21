import { Component, HostListener, signal } from '@angular/core';
import { Button } from './components/button/button';
import { Grid } from './components/grid/grid';
import { LogModal } from './components/log-modal/log-modal';
import { QueuePanel } from './components/queue-panel/queue-panel';
import { Cell } from './models/cell.model';
import { Floor } from './models/floor.model';
import { QueuedCommand } from './models/queued-command.model';
import { Robot } from './models/robot.model';

const DEFAULT_WIDTH = 5;
const DEFAULT_HEIGHT = 5;

function openCells(floor: Floor): Cell[] {
  const cells: Cell[] = [];
  for (let y = 0; y < floor.height; y++) {
    for (let x = 0; x < floor.width; x++) {
      cells.push({
        id: cells.length + 1,
        obstacle: false,
        xPosition: x,
        yPosition: y,
        floorId: floor.id,
      });
    }
  }
  return cells;
}

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
  // Local default floor until the API endpoints exist.
  protected readonly floor = signal<Floor>({ id: 1, width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT });
  protected readonly cells = signal<Cell[]>(openCells(this.floor()));
  protected readonly robots = signal<Robot[]>([]);
  protected readonly selectedRobotId = signal<number | null>(null);
  protected readonly queue = signal<QueuedCommand[]>([]);
  protected readonly logOpen = signal(false);

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
