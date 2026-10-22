import { Component, input, output } from '@angular/core';

@Component({
  selector: 'app-button',
  templateUrl: './button.html',
})
export class Button {
  readonly label = input.required<string>();
  readonly disabled = input(false);
  /** Orange border instead of the normal one. */
  readonly highlighted = input(false);
  readonly pressed = output();

  protected onClick(): void {
    if (!this.disabled()) {
      this.pressed.emit();
    }
  }
}
