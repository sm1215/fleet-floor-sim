import { Component, input } from '@angular/core';
import { QueuedCommand } from '../../models/queued-command.model';

@Component({
  selector: 'app-queue-panel',
  templateUrl: './queue-panel.html',
  host: { class: 'flex flex-col' },
})
export class QueuePanel {
  readonly robotId = input<number | null>(null);
  /** Commands in FIFO order: the first item runs next. */
  readonly commands = input<QueuedCommand[]>([]);
}
