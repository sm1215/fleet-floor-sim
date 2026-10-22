import { TestBed } from '@angular/core/testing';
import { Cell as CellModel } from '../../models/cell.model';
import { Direction } from '../../models/direction';
import { Cell } from './cell';

describe('Cell', () => {
  async function render(obstacle: boolean, options: { robot?: boolean; editMode?: boolean } = {}) {
    const fixture = TestBed.createComponent(Cell);
    const cell: CellModel = { id: 1, obstacle, xPosition: 0, yPosition: 0, floorId: 1 };
    fixture.componentRef.setInput('cell', cell);
    if (options.robot) {
      fixture.componentRef.setInput('robot', {
        id: 7,
        direction: Direction.North,
        cellId: 1,
        x: 0,
        y: 0,
      });
    }
    if (options.editMode !== undefined) fixture.componentRef.setInput('editMode', options.editMode);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    return { fixture, el, box: el.querySelector<HTMLElement>('.cell')! };
  }

  it('an Obstacle cell is filled solid red', async () => {
    const { box } = await render(true);
    expect(box.classList).toContain('obstacle');
    expect(box.classList).toContain('bg-[#e03131]');
  });

  it('an Open cell has no fill', async () => {
    const { box } = await render(false);
    expect(box.classList).not.toContain('obstacle');
    expect(Array.from(box.classList).filter((c) => c.startsWith('bg-'))).toEqual([]);
  });

  it('border is black with edit mode off and orange with it on', async () => {
    const off = await render(false, { editMode: false });
    expect(off.box.classList).toContain('border-black');
    expect(off.box.classList).not.toContain('border-[#f08c00]');

    off.fixture.componentRef.setInput('editMode', true);
    await off.fixture.whenStable();
    expect(off.box.classList).toContain('border-[#f08c00]');
    expect(off.box.classList).not.toContain('border-black');
  });

  it('hosts a robot when one is given', async () => {
    const { el } = await render(false, { robot: true });
    expect(el.querySelector('app-robot')).not.toBeNull();
  });

  it('has no robot by default', async () => {
    const { el } = await render(false);
    expect(el.querySelector('app-robot')).toBeNull();
  });

  it('a click on the cell emits clicked', async () => {
    const { fixture, box } = await render(false);
    const clicked = vi.fn();
    fixture.componentInstance.clicked.subscribe(clicked);
    box.click();
    expect(clicked).toHaveBeenCalledTimes(1);
  });

  it('is focusable and Enter emits clicked', async () => {
    const { fixture, box } = await render(false);
    const clicked = vi.fn();
    fixture.componentInstance.clicked.subscribe(clicked);
    expect(box.getAttribute('role')).toBe('button');
    expect(box.tabIndex).toBe(0);
    box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(clicked).toHaveBeenCalledTimes(1);
  });

  it('a click on its robot emits robotClicked, not clicked', async () => {
    const { fixture, el } = await render(false, { robot: true });
    const clicked = vi.fn();
    const robotClicked = vi.fn();
    fixture.componentInstance.clicked.subscribe(clicked);
    fixture.componentInstance.robotClicked.subscribe(robotClicked);
    el.querySelector<HTMLElement>('app-robot')!.click();
    expect(robotClicked).toHaveBeenCalledTimes(1);
    expect(clicked).not.toHaveBeenCalled();
  });

  it('passes selected on to its robot', async () => {
    const { fixture, el } = await render(false, { robot: true });
    fixture.componentRef.setInput('selected', true);
    await fixture.whenStable();
    expect(el.querySelector('.robot')!.classList).toContain('border-green-300');
  });
});
