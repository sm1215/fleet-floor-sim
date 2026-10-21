import { Component, computed, input } from '@angular/core';
import { Robot as RobotModel } from '../../models/robot.model';

@Component({
  selector: 'app-robot',
  templateUrl: './robot.html',
  host: { class: 'block h-full w-full' },
})
export class Robot {
  readonly robot = input.required<RobotModel>();

  /** Rotation from up (North), 90deg per Direction step. */
  protected readonly arrowTransform = computed(() => `rotate(${this.robot().direction * 90}deg)`);
}
