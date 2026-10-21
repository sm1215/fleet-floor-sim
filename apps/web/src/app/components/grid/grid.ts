import { Component, computed, input } from '@angular/core';
import { Cell as CellModel } from '../../models/cell.model';
import { Floor } from '../../models/floor.model';
import { Robot } from '../../models/robot.model';
import { Cell } from '../cell/cell';

const MAX_FLOOR_WIDTH = 500;
const MAX_FLOOR_HEIGHT = 400;

@Component({
  selector: 'app-grid',
  imports: [Cell],
  templateUrl: './grid.html',
  host: { class: 'block' },
})
export class Grid {
  readonly floor = input.required<Floor>();
  readonly cells = input.required<CellModel[]>();
  readonly robots = input<Robot[]>([]);

  /** Square cell size in px, so the floor fits within MAX_FLOOR_WIDTH x MAX_FLOOR_HEIGHT. */
  protected readonly cellSize = computed(() => {
    const { width, height } = this.floor();
    return Math.floor(Math.min(MAX_FLOOR_WIDTH / width, MAX_FLOOR_HEIGHT / height));
  });

  /** Cells in render order: top row (y = height - 1) first, down to y = 0; x left to right. */
  protected readonly orderedCells = computed(() =>
    [...this.cells()].sort((a, b) => b.yPosition - a.yPosition || a.xPosition - b.xPosition),
  );

  protected readonly robotsByCell = computed(
    () => new Map(this.robots().map((robot) => [robot.cellId, robot])),
  );
}
