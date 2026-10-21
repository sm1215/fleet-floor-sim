import { Component, input } from '@angular/core';
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
}
