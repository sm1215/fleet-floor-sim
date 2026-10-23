import {
  afterNextRender,
  Component,
  ElementRef,
  inject,
  input,
  OnInit,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { LogEntry } from '../../models/log-entry.model';
import { SimulationApiService } from '../../services/simulation-api.service';

@Component({
  selector: 'app-log-modal',
  templateUrl: './log-modal.html',
})
export class LogModal implements OnInit {
  /** The viewed floor; only its log is shown. */
  readonly floorId = input.required<number>();
  readonly closed = output();

  protected readonly entries = signal<LogEntry[]>([]);

  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  private readonly api = inject(SimulationApiService);

  constructor() {
    // showModal() gives Escape handling, focus management and an inert background.
    afterNextRender(() => this.dialog().nativeElement.showModal());
  }

  ngOnInit(): void {
    // App re-creates the modal on each open, so the log is fetched every time.
    this.api.getLogEntries(this.floorId()).subscribe({
      next: (entries) => this.entries.set(entries),
      // The modal stays open, empty.
      error: () => undefined,
    });
  }

  protected close(event?: Event): void {
    // Let the parent remove the modal; close() also returns focus to the Log button.
    event?.preventDefault();
    this.dialog().nativeElement.close();
    this.closed.emit();
  }
}
