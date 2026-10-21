import { TestBed } from '@angular/core/testing';
import { Direction } from '../../models/direction';
import { Robot } from './robot';

describe('Robot', () => {
  async function render(direction: Direction) {
    const fixture = TestBed.createComponent(Robot);
    fixture.componentRef.setInput('robot', { id: 99, direction, cellId: 1, x: 0, y: 0 });
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  it('shows the robot ID', async () => {
    const el = await render(Direction.North);
    expect(el.querySelector('.robot-id')?.textContent?.trim()).toBe('R99');
  });

  it.each([
    [Direction.North, 'rotate(0deg)'],
    [Direction.East, 'rotate(90deg)'],
    [Direction.South, 'rotate(180deg)'],
    [Direction.West, 'rotate(270deg)'],
  ])('rotates the arrow for direction %i to %s', async (direction, transform) => {
    const el = await render(direction);
    expect(el.querySelector<HTMLElement>('.robot-arrow')?.style.transform).toBe(transform);
  });
});
