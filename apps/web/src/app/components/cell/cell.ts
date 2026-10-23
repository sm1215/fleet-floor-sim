import { Component, input, output } from '@angular/core';
import { Cell as CellModel } from '../../models/cell.model';
import { Robot as RobotModel } from '../../models/robot.model';
import { Robot } from '../robot/robot';

@Component({
  selector: 'app-cell',
  imports: [Robot],
  templateUrl: './cell.html',
  host: { class: 'block' },
})
export class Cell {
  readonly cell = input.required<CellModel>();
  readonly robot = input<RobotModel>();
  readonly editMode = input(false);
  readonly selected = input(false);
  /** `shiftKey`: Shift was held (Shift+Click issues a GOTO; robot-rules.md). */
  readonly clicked = output<{ shiftKey: boolean }>();
  readonly robotClicked = output();

  /** Shift+Click issues a GOTO; stop the browser extending a text selection. */
  protected onMouseDown(event: MouseEvent): void {
    if (event.shiftKey) event.preventDefault();
  }
}
