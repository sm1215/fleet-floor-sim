import { Component, computed, input, output } from '@angular/core';
import { Direction } from '../../models/direction';
import { Robot as RobotModel } from '../../models/robot.model';

const ARROWS: Record<Direction, string> = {
  [Direction.North]: '^',
  [Direction.East]: '>',
  [Direction.South]: 'v',
  [Direction.West]: '<',
};

@Component({
  selector: 'app-robot',
  templateUrl: './robot.html',
  host: { class: 'block h-full w-full cursor-pointer', '(click)': 'onClick($event)' },
})
export class Robot {
  readonly robot = input.required<RobotModel>();
  readonly selected = input(false);
  readonly clicked = output();

  protected readonly arrow = computed(() => ARROWS[this.robot().direction]);

  /** Stops the click here so the cell underneath never sees it. */
  protected onClick(event: MouseEvent): void {
    event.stopPropagation();
    this.clicked.emit();
  }
}
