import { TestBed } from '@angular/core/testing';
import { Direction } from '../../models/direction';
import { Robot as RobotModel } from '../../models/robot.model';
import { Robot } from './robot';

describe('Robot', () => {
  async function render(direction: Direction, selected?: boolean) {
    const fixture = TestBed.createComponent(Robot);
    fixture.componentRef.setInput('robot', {
      id: 5,
      displayId: 12,
      direction,
      cellId: 1,
      x: 0,
      y: 0,
    });
    if (selected !== undefined) fixture.componentRef.setInput('selected', selected);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    return { fixture, el, box: el.querySelector<HTMLElement>('.robot')! };
  }

  it('shows the ID as an uppercase R plus displayId, not the database Id', async () => {
    const { el } = await render(Direction.North);
    expect(el.querySelector('.robot-id')?.textContent?.trim()).toBe('R12');
  });

  it.each([
    [Direction.North, '^'],
    [Direction.East, '>'],
    [Direction.South, 'v'],
    [Direction.West, '<'],
  ])('direction %i shows the arrow %s', async (direction, arrow) => {
    const { el } = await render(direction);
    expect(el.querySelector('.robot-arrow')?.textContent?.trim()).toBe(arrow);
  });

  it('direction.ts values: 0 N, 1 E, 2 S, 3 W', () => {
    expect([Direction.North, Direction.East, Direction.South, Direction.West]).toEqual([
      0, 1, 2, 3,
    ]);
  });

  it('x/y are read-only, taken from the cell', () => {
    const robot: RobotModel = {
      id: 1,
      displayId: 1,
      direction: Direction.North,
      cellId: 4,
      x: 2,
      y: 3,
    };
    // @ts-expect-error x is read-only
    robot.x = 5;
    // @ts-expect-error y is read-only
    robot.y = 5;
    expect(robot.cellId).toBe(4);
  });

  it('has the Styles table classes', async () => {
    const { box } = await render(Direction.North);
    for (const cls of ['box-border', 'border-2', 'bg-blue-200', 'text-blue-900']) {
      expect(box.classList).toContain(cls);
    }
  });

  it('centers the arrow and puts the ID centered at the bottom', async () => {
    const { box, el } = await render(Direction.North);
    for (const cls of ['flex', 'items-center', 'justify-center']) {
      expect(box.classList).toContain(cls);
    }
    const id = el.querySelector('.robot-id')!;
    for (const cls of ['absolute', 'inset-x-0', 'bottom-0', 'text-center']) {
      expect(id.classList).toContain(cls);
    }
  });

  it('arrow and ID use the text color class, with no color of their own', async () => {
    const { box, el } = await render(Direction.North);
    expect(box.classList).toContain('text-blue-900');
    for (const part of [el.querySelector('.robot-arrow')!, el.querySelector('.robot-id')!]) {
      expect(box.contains(part)).toBe(true);
      // A palette color (text-red-600) or hex color (text-[#f08c00]) would override the border color.
      const colors = Array.from(part.classList).filter((c) => /^text-([a-z]+-\d+|\[#)/.test(c));
      expect(colors).toEqual([]);
    }
  });

  it('unselected uses border-blue-900; selected uses border-green-300 instead', async () => {
    const off = await render(Direction.North, false);
    expect(off.box.classList).toContain('border-blue-900');
    expect(off.box.classList).not.toContain('border-green-300');

    off.fixture.componentRef.setInput('selected', true);
    await off.fixture.whenStable();
    expect(off.box.classList).toContain('border-green-300');
    expect(off.box.classList).not.toContain('border-blue-900');
  });

  it('a click emits clicked and does not reach the parent', async () => {
    const { fixture, el } = await render(Direction.North);
    const clicked = vi.fn();
    fixture.componentInstance.clicked.subscribe(clicked);
    const parent = vi.fn();
    const wrapper = document.createElement('div');
    wrapper.addEventListener('click', parent);
    wrapper.appendChild(el);
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(clicked).toHaveBeenCalledTimes(1);
    expect(parent).not.toHaveBeenCalled();
  });
});
