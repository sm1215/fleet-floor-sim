import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { Observable, of, Subject, throwError } from 'rxjs';
import { Cell } from '../../models/cell.model';
import { Floor, FloorSize } from '../../models/floor.model';
import { SimulationApiService } from '../../services/simulation-api.service';
import { Grid, RESIZE_ERROR, SERVER_ERROR } from './grid';

function makeCells(floor: Floor): Cell[] {
  const cells: Cell[] = [];
  for (let y = 0; y < floor.height; y++) {
    for (let x = 0; x < floor.width; x++) {
      cells.push({
        id: cells.length + 1,
        obstacle: false,
        xPosition: x,
        yPosition: y,
        floorId: floor.id,
      });
    }
  }
  return cells;
}

describe('Grid', () => {
  // The floor as the mocked API currently stores it.
  let server: Floor | null;
  let api: {
    getFloors: ReturnType<typeof vi.fn<() => Observable<Floor[]>>>;
    createFloor: ReturnType<typeof vi.fn<(size: FloorSize) => Observable<Floor>>>;
    updateFloor: ReturnType<typeof vi.fn<(id: number, size: FloorSize) => Observable<Floor>>>;
    getCells: ReturnType<typeof vi.fn<(floorId: number) => Observable<Cell[]>>>;
  };

  beforeEach(() => {
    server = null;
    api = {
      getFloors: vi.fn(() => of(server ? [server] : [])),
      createFloor: vi.fn((size: FloorSize) => of((server = { id: 1, ...size }))),
      updateFloor: vi.fn((id: number, size: FloorSize) => of((server = { id, ...size }))),
      getCells: vi.fn(() => of(server ? makeCells(server) : [])),
    };
    TestBed.configureTestingModule({
      providers: [{ provide: SimulationApiService, useValue: api }],
    });
  });

  async function render(width?: number, height?: number) {
    if (width !== undefined && height !== undefined) server = { id: 1, width, height };
    const fixture = TestBed.createComponent(Grid);
    const errors: string[] = [];
    fixture.componentInstance.gridError.subscribe((text) => errors.push(text));
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    return { fixture, el, errors };
  }

  function slider(el: HTMLElement, label: 'Width' | 'Height'): HTMLInputElement {
    return el.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!;
  }

  function drag(el: HTMLElement, label: 'Width' | 'Height', value: number) {
    const input = slider(el, label);
    input.value = String(value);
    input.dispatchEvent(new Event('input'));
  }

  function release(el: HTMLElement, label: 'Width' | 'Height') {
    slider(el, label).dispatchEvent(new Event('change'));
  }

  it('sliders have min 1, max 20, step 1 and default to 5 before the floor loads', async () => {
    api.getFloors.mockReturnValue(new Subject<Floor[]>());
    const { el } = await render();
    for (const label of ['Width', 'Height'] as const) {
      const input = slider(el, label);
      expect(input.type).toBe('range');
      expect(input.min).toBe('1');
      expect(input.max).toBe('20');
      expect(input.step).toBe('1');
      expect(input.value).toBe('5');
    }
    expect(el.querySelector('.floor')).toBeNull();
  });

  it('renders width * height cells', async () => {
    const { el } = await render(5, 4);
    expect(el.querySelectorAll('app-cell').length).toBe(20);
  });

  it('first rendered row is y = height - 1 and x increases left to right', async () => {
    const { el } = await render(5, 4);
    const cells = Array.from(el.querySelectorAll('app-cell'));
    expect(cells.slice(0, 5).map((c) => c.getAttribute('data-y'))).toEqual(Array(5).fill('3'));
    expect(cells.slice(0, 5).map((c) => c.getAttribute('data-x'))).toEqual([
      '0',
      '1',
      '2',
      '3',
      '4',
    ]);
    const bottomLeft = cells[cells.length - 5];
    expect(bottomLeft.getAttribute('data-x')).toBe('0');
    expect(bottomLeft.getAttribute('data-y')).toBe('0');
  });

  it('renders a 20 x 20 grid', async () => {
    const { el } = await render(20, 20);
    expect(el.querySelectorAll('app-cell').length).toBe(400);
  });

  it.each([
    [5, 5, 80],
    [20, 20, 20],
    [10, 4, 50],
    [4, 10, 40],
  ])('sizes cells for a %i x %i floor to %ipx within 500 x 400', async (width, height, size) => {
    const { el } = await render(width, height);
    const floor = el.querySelector<HTMLElement>('.floor')!;
    expect(floor.style.gridTemplateColumns).toBe(`repeat(${width}, ${size}px)`);
    expect(floor.style.gridTemplateRows).toBe(`repeat(${height}, ${size}px)`);
  });

  it('empty GET /floors → createFloor({width:5,height:5}); UI shows 5x5', async () => {
    const { el } = await render();
    expect(api.createFloor).toHaveBeenCalledExactlyOnceWith({ width: 5, height: 5 });
    expect(el.querySelectorAll('app-cell').length).toBe(25);
    expect(slider(el, 'Width').value).toBe('5');
    expect(slider(el, 'Height').value).toBe('5');
  });

  it('existing floor → no createFloor; sliders and grid show its size', async () => {
    const { el } = await render(7, 3);
    expect(api.createFloor).not.toHaveBeenCalled();
    expect(api.getCells).toHaveBeenCalledWith(1);
    expect(slider(el, 'Width').value).toBe('7');
    expect(slider(el, 'Height').value).toBe('3');
    expect(el.querySelectorAll('app-cell').length).toBe(21);
  });

  it('input event does not PATCH; change event PATCHes once with both values', async () => {
    const { fixture, el } = await render(7, 3);
    drag(el, 'Width', 8);
    await fixture.whenStable();
    expect(api.updateFloor).not.toHaveBeenCalled();
    release(el, 'Width');
    await fixture.whenStable();
    expect(api.updateFloor).toHaveBeenCalledExactlyOnceWith(1, { width: 8, height: 3 });
  });

  it('successful PATCH reloads cells', async () => {
    const { fixture, el } = await render(7, 3);
    api.getCells.mockClear();
    drag(el, 'Height', 4);
    release(el, 'Height');
    await fixture.whenStable();
    expect(api.getCells).toHaveBeenCalledExactlyOnceWith(1);
    expect(el.querySelectorAll('app-cell').length).toBe(28);
  });

  it('rejected PATCH reverts sliders and grid to the last saved size', async () => {
    const { fixture, el } = await render(5, 3);
    drag(el, 'Width', 6);
    release(el, 'Width');
    await fixture.whenStable();

    api.updateFloor.mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 409 })));
    drag(el, 'Width', 2);
    // A browser renders the input event before the HTTP error arrives.
    await fixture.whenStable();
    release(el, 'Width');
    await fixture.whenStable();

    expect(slider(el, 'Width').value).toBe('6');
    expect(slider(el, 'Height').value).toBe('3');
    expect(el.querySelectorAll('app-cell').length).toBe(18);
    const floor = el.querySelector<HTMLElement>('.floor')!;
    expect(floor.style.gridTemplateColumns).toMatch(/^repeat\(6, /);
  });

  it('409 emits the exact RESIZE_ERROR text', async () => {
    const { fixture, el, errors } = await render(5, 5);
    api.updateFloor.mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 409 })));
    drag(el, 'Width', 1);
    release(el, 'Width');
    await fixture.whenStable();
    expect(RESIZE_ERROR).toBe("Can't resize grid, not enough space for existing robots");
    expect(errors).toEqual([RESIZE_ERROR]);
  });

  it('non-409 error reverts and emits SERVER_ERROR', async () => {
    const { fixture, el, errors } = await render(5, 5);
    api.updateFloor.mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 500 })));
    drag(el, 'Width', 3);
    await fixture.whenStable();
    release(el, 'Width');
    await fixture.whenStable();
    expect(slider(el, 'Width').value).toBe('5');
    expect(SERVER_ERROR).toBe("Server can't be reached");
    expect(errors).toEqual([SERVER_ERROR]);
  });

  it('unreachable server (status 0) on PATCH emits SERVER_ERROR', async () => {
    const { fixture, el, errors } = await render(5, 5);
    api.updateFloor.mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 0 })));
    drag(el, 'Width', 3);
    await fixture.whenStable();
    release(el, 'Width');
    await fixture.whenStable();
    expect(errors).toEqual([SERVER_ERROR]);
  });

  it.each([
    [
      'getFloors',
      () => api.getFloors.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 0 }))),
    ],
    [
      'createFloor',
      () => api.createFloor.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 0 }))),
    ],
    [
      'getCells',
      () => api.getCells.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 0 }))),
    ],
  ])('load failure in %s emits SERVER_ERROR', async (_name, fail) => {
    fail();
    const { errors } = await render();
    expect(errors).toEqual([SERVER_ERROR]);
  });

  it('PATCH succeeds but cell reload fails → keeps the last shown floor, reverts, emits SERVER_ERROR', async () => {
    const { fixture, el, errors } = await render(5, 3);
    api.getCells.mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 0 })));
    drag(el, 'Width', 7);
    await fixture.whenStable();
    release(el, 'Width');
    await fixture.whenStable();
    expect(slider(el, 'Width').value).toBe('5');
    expect(el.querySelectorAll('app-cell').length).toBe(15);
    expect(errors).toEqual([SERVER_ERROR]);
  });

  it('new size and its cells show together: no new columns until the cells arrive', async () => {
    const { fixture, el } = await render(5, 3);
    const cells = new Subject<Cell[]>();
    api.getCells.mockReturnValueOnce(cells);
    drag(el, 'Width', 7);
    release(el, 'Width');
    await fixture.whenStable();
    const floor = () => el.querySelector<HTMLElement>('.floor')!;
    expect(floor().style.gridTemplateColumns).toMatch(/^repeat\(5, /);
    expect(el.querySelectorAll('app-cell').length).toBe(15);

    cells.next(makeCells({ id: 1, width: 7, height: 3 }));
    await fixture.whenStable();
    expect(floor().style.gridTemplateColumns).toMatch(/^repeat\(7, /);
    expect(el.querySelectorAll('app-cell').length).toBe(21);
  });

  it('two releases in a row: the second PATCH sends both current values', async () => {
    const { fixture, el } = await render(5, 3);
    api.updateFloor.mockReturnValueOnce(new Subject<Floor>());
    drag(el, 'Width', 8);
    release(el, 'Width');
    drag(el, 'Height', 4);
    release(el, 'Height');
    await fixture.whenStable();
    expect(api.updateFloor.mock.calls).toEqual([
      [1, { width: 8, height: 3 }],
      [1, { width: 8, height: 4 }],
    ]);
    expect(el.querySelectorAll('app-cell').length).toBe(32);
  });

  it('a late response to an earlier release is ignored', async () => {
    const { fixture, el, errors } = await render(5, 3);
    const first = new Subject<Floor>();
    api.updateFloor.mockReturnValueOnce(first);
    drag(el, 'Width', 8);
    release(el, 'Width');
    drag(el, 'Height', 4);
    await fixture.whenStable();
    release(el, 'Height');
    await fixture.whenStable();

    first.error(new HttpErrorResponse({ status: 409 }));
    await fixture.whenStable();
    expect(errors).toEqual([]);
    expect(slider(el, 'Width').value).toBe('8');
    expect(slider(el, 'Height').value).toBe('4');
    expect(el.querySelectorAll('app-cell').length).toBe(32);
  });
});
