import { TestBed } from '@angular/core/testing';
import { Cell } from '../../models/cell.model';
import { Floor } from '../../models/floor.model';
import { Grid } from './grid';

function makeCells(floor: Floor): Cell[] {
  const cells: Cell[] = [];
  for (let y = 0; y < floor.height; y++) {
    for (let x = 0; x < floor.width; x++) {
      cells.push({ id: cells.length + 1, obstacle: false, xPosition: x, yPosition: y, floorId: 1 });
    }
  }
  return cells;
}

describe('Grid', () => {
  async function render(width: number, height: number) {
    const floor: Floor = { id: 1, width, height };
    const fixture = TestBed.createComponent(Grid);
    fixture.componentRef.setInput('floor', floor);
    fixture.componentRef.setInput('cells', makeCells(floor));
    fixture.componentRef.setInput('robots', []);
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  it('renders width * height cells', async () => {
    const el = await render(5, 4);
    expect(el.querySelectorAll('app-cell').length).toBe(20);
  });

  it('places the cell at 0,0 bottom-left', async () => {
    const el = await render(5, 4);
    const cells = el.querySelectorAll('app-cell');
    const bottomLeft = cells[cells.length - 5];
    expect(bottomLeft.getAttribute('data-x')).toBe('0');
    expect(bottomLeft.getAttribute('data-y')).toBe('0');
    expect(cells[0].getAttribute('data-y')).toBe('3');
  });

  it('renders a 20 x 20 grid', async () => {
    const el = await render(20, 20);
    expect(el.querySelectorAll('app-cell').length).toBe(400);
  });

  it.each([
    [5, 5, 80],
    [20, 20, 20],
    [10, 4, 50],
    [4, 10, 40],
  ])('sizes cells for a %i x %i floor to %ipx within 500 x 400', async (width, height, size) => {
    const el = await render(width, height);
    const floor = el.querySelector<HTMLElement>('.floor')!;
    expect(floor.style.gridTemplateColumns).toBe(`repeat(${width}, ${size}px)`);
    expect(floor.style.gridTemplateRows).toBe(`repeat(${height}, ${size}px)`);
  });

  it('marks the origin', async () => {
    const el = await render(5, 5);
    expect(el.textContent).toContain('Origin: 0,0');
  });
});
