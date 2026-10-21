import { afterNextRender, Component, ElementRef, output, viewChild } from '@angular/core';

@Component({
  selector: 'app-log-modal',
  templateUrl: './log-modal.html',
})
export class LogModal {
  readonly closed = output();

  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  constructor() {
    // showModal() gives Escape handling, focus management and an inert background.
    afterNextRender(() => this.dialog().nativeElement.showModal());
  }

  protected close(event?: Event): void {
    // Let the parent remove the modal; close() also returns focus to the Log button.
    event?.preventDefault();
    this.dialog().nativeElement.close();
    this.closed.emit();
  }
}
