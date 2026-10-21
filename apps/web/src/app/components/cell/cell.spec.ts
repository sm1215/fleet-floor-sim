import { TestBed } from '@angular/core/testing';
import { Cell as CellModel } from '../../models/cell.model';
import { Direction } from '../../models/direction';
import { Cell } from './cell';

describe('Cell', () => {
  async function render(obstacle: boolean, withRobot = false) {
    const fixture = TestBed.createComponent(Cell);
    const cell: CellModel = { id: 1, obstacle, xPosition: 0, yPosition: 0, floorId: 1 };
    fixture.componentRef.setInput('cell', cell);
    if (withRobot) {
      fixture.componentRef.setInput('robot', {
        id: 7,
        direction: Direction.North,
        cellId: 1,
        x: 0,
        y: 0,
      });
    }
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  it('applies the obstacle styling when obstacle is true', async () => {
    const el = await render(true);
    expect(el.querySelector('.cell')?.classList).toContain('obstacle');
  });

  it('does not apply the obstacle styling to an open cell', async () => {
    const el = await render(false);
    expect(el.querySelector('.cell')?.classList).not.toContain('obstacle');
  });

  it('hosts a robot when one is given', async () => {
    const el = await render(false, true);
    expect(el.querySelector('app-robot')).not.toBeNull();
  });

  it('has no robot by default', async () => {
    const el = await render(false);
    expect(el.querySelector('app-robot')).toBeNull();
  });
});
