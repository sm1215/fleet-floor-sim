import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Observable, of, Subject, throwError } from 'rxjs';
import { Cell } from '../../models/cell.model';
import { Direction } from '../../models/direction';
import { FloorState } from '../../models/floor-state.model';
import { Floor, FloorSize } from '../../models/floor.model';
import { Robot } from '../../models/robot.model';
import { SimulationApiService } from '../../services/simulation-api.service';
import { Grid, PLACE_ERROR, RESIZE_ERROR, SERVER_ERROR } from './grid';

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

/** What the mocked `GET /floors/:id/history` returns. */
const PAST_STATE: FloorState = {
  width: 2,
  height: 2,
  cells: [
    { x: 0, y: 0, obstacle: false },
    { x: 1, y: 0, obstacle: true },
    { x: 0, y: 1, obstacle: false },
    { x: 1, y: 1, obstacle: false },
  ],
  robots: [{ id: 9, displayId: 3, x: 0, y: 1, direction: Direction.East, queue: ['MOVE', 'LEFT'] }],
};

function robot(id: number, cellId: number, x: number, y: number, direction = Direction.North) {
  return { id, displayId: id, direction, cellId, x, y };
}

describe('Grid', () => {
  // The floor as the mocked API currently stores it.
  let server: Floor | null;
  let api: {
    getFloors: ReturnType<typeof vi.fn<() => Observable<Floor[]>>>;
    floorCommand: ReturnType<typeof vi.fn<(size: FloorSize) => Observable<void>>>;
    resetFloor: ReturnType<typeof vi.fn<(id: number) => Observable<Floor>>>;
    getCells: ReturnType<typeof vi.fn<(floorId: number) => Observable<Cell[]>>>;
    obstacleCommand: ReturnType<typeof vi.fn<(x: number, y: number) => Observable<void>>>;
    getRobots: ReturnType<typeof vi.fn<(floorId: number) => Observable<Robot[]>>>;
    getFloorState: ReturnType<
      typeof vi.fn<(floorId: number, tick: number) => Observable<FloorState>>
    >;
    placeCommand: ReturnType<
      typeof vi.fn<
        (x: number, y: number, direction: Direction, displayId?: number) => Observable<void>
      >
    >;
  };
  // The robots as the mocked API currently stores them.
  let robots: Robot[];
  // Floors after `server`, and their robots by floor id.
  let others: Floor[];
  let otherRobots: Map<number, Robot[]>;
  const floorById = (id: number) => [server, ...others].find((f) => f?.id === id) ?? null;
  // Ids of the cells the mocked API stores as Obstacles.
  let obstacleIds: number[];
  const cellIdAt = (x: number, y: number) =>
    makeCells(server!).find((c) => c.xPosition === x && c.yPosition === y)!.id;

  beforeEach(() => {
    server = null;
    others = [];
    otherRobots = new Map();
    obstacleIds = [];
    api = {
      getFloors: vi.fn(() => of(server ? [server, ...others] : others)),
      floorCommand: vi.fn((size: FloorSize) => {
        server = { id: server?.id ?? 1, ...size };
        return of(undefined);
      }),
      resetFloor: vi.fn((id: number) => {
        robots = [];
        obstacleIds = [];
        return of((server = { id, width: 5, height: 5 }));
      }),
      getCells: vi.fn((floorId: number) => {
        const floor = floorById(floorId);
        return of(
          floor
            ? makeCells(floor).map((c) => ({ ...c, obstacle: obstacleIds.includes(c.id) }))
            : [],
        );
      }),
      obstacleCommand: vi.fn((x: number, y: number) => {
        const id = cellIdAt(x, y);
        obstacleIds = obstacleIds.includes(id)
          ? obstacleIds.filter((o) => o !== id)
          : [...obstacleIds, id];
        return of(undefined);
      }),
      getRobots: vi.fn((floorId: number) =>
        of(floorId === server?.id ? robots : (otherRobots.get(floorId) ?? [])),
      ),
      getFloorState: vi.fn(() => of(PAST_STATE)),
      // A new robot gets displayId 40 (id 40); an existing one moves and turns.
      placeCommand: vi.fn((x: number, y: number, direction: Direction, displayId?: number) => {
        const moved = robot(displayId ?? 40, cellIdAt(x, y), x, y, direction);
        robots = [...robots.filter((r) => r.displayId !== moved.displayId), moved];
        return of(undefined);
      }),
    };
    robots = [];
    TestBed.configureTestingModule({
      providers: [{ provide: SimulationApiService, useValue: api }],
    });
  });

  async function render(width?: number, height?: number, editMode?: boolean) {
    if (width !== undefined && height !== undefined) server = { id: 1, width, height };
    const fixture = TestBed.createComponent(Grid);
    if (editMode !== undefined) fixture.componentRef.setInput('editMode', editMode);
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

  function labels(el: HTMLElement, selector: '.row-labels' | '.column-labels'): string[] {
    return Array.from(el.querySelectorAll(`${selector} span`)).map((s) => s.textContent!.trim());
  }

  it('row labels read height - 1 down to 0; column labels read 0 to width - 1', async () => {
    const { el } = await render(5, 4);
    expect(labels(el, '.row-labels')).toEqual(['3', '2', '1', '0']);
    expect(labels(el, '.column-labels')).toEqual(['0', '1', '2', '3', '4']);
  });

  it('height increase adds new row labels at the top; existing labels keep their numbers', async () => {
    const { fixture, el } = await render(3, 2);
    expect(labels(el, '.row-labels')).toEqual(['1', '0']);
    drag(el, 'Height', 4);
    release(el, 'Height');
    await fixture.whenStable();
    expect(labels(el, '.row-labels')).toEqual(['3', '2', '1', '0']);
    expect(labels(el, '.column-labels')).toEqual(['0', '1', '2']);
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

  it('empty GET /floors → floorCommand({width:5,height:5}), then GET /floors again; UI shows 5x5', async () => {
    const { el } = await render();
    expect(api.floorCommand).toHaveBeenCalledExactlyOnceWith({ width: 5, height: 5 });
    expect(api.getFloors).toHaveBeenCalledTimes(2);
    expect(el.querySelectorAll('app-cell').length).toBe(25);
    expect(slider(el, 'Width').value).toBe('5');
    expect(slider(el, 'Height').value).toBe('5');
  });

  it('existing floor → no floorCommand; sliders and grid show its size', async () => {
    const { el } = await render(7, 3);
    expect(api.floorCommand).not.toHaveBeenCalled();
    expect(api.getCells).toHaveBeenCalledWith(1);
    expect(slider(el, 'Width').value).toBe('7');
    expect(slider(el, 'Height').value).toBe('3');
    expect(el.querySelectorAll('app-cell').length).toBe(21);
  });

  it('input event does not save; change event sends floorCommand once with both values', async () => {
    const { fixture, el } = await render(7, 3);
    drag(el, 'Width', 8);
    await fixture.whenStable();
    expect(api.floorCommand).not.toHaveBeenCalled();
    release(el, 'Width');
    await fixture.whenStable();
    expect(api.floorCommand).toHaveBeenCalledExactlyOnceWith({ width: 8, height: 3 });
  });

  it('successful resize refetches the floor and its cells', async () => {
    const { fixture, el } = await render(7, 3);
    api.getCells.mockClear();
    api.getFloors.mockClear();
    drag(el, 'Height', 4);
    release(el, 'Height');
    await fixture.whenStable();
    expect(api.getFloors).toHaveBeenCalledTimes(1);
    expect(api.getCells).toHaveBeenCalledExactlyOnceWith(1);
    expect(el.querySelectorAll('app-cell').length).toBe(28);
  });

  it('rejected resize (400) reverts sliders and grid to the last saved size', async () => {
    const { fixture, el } = await render(5, 3);
    drag(el, 'Width', 6);
    release(el, 'Width');
    await fixture.whenStable();

    api.floorCommand.mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 400 })));
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

  it('400 emits the exact RESIZE_ERROR text', async () => {
    const { fixture, el, errors } = await render(5, 5);
    api.floorCommand.mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 400 })));
    drag(el, 'Width', 1);
    release(el, 'Width');
    await fixture.whenStable();
    expect(RESIZE_ERROR).toBe("Can't resize grid, not enough space for existing robots");
    expect(errors).toEqual([RESIZE_ERROR]);
  });

  it('non-400 error reverts and emits SERVER_ERROR', async () => {
    const { fixture, el, errors } = await render(5, 5);
    api.floorCommand.mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 500 })));
    drag(el, 'Width', 3);
    await fixture.whenStable();
    release(el, 'Width');
    await fixture.whenStable();
    expect(slider(el, 'Width').value).toBe('5');
    expect(SERVER_ERROR).toBe("Server can't be reached");
    expect(errors).toEqual([SERVER_ERROR]);
  });

  it('unreachable server (status 0) on resize emits SERVER_ERROR', async () => {
    const { fixture, el, errors } = await render(5, 5);
    api.floorCommand.mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 0 })));
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
      'floorCommand',
      () =>
        api.floorCommand.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 0 }))),
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

  it('resize succeeds but cell reload fails → keeps the last shown floor, reverts, emits SERVER_ERROR', async () => {
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

  it('two releases in a row: the second floorCommand sends both current values', async () => {
    const { fixture, el } = await render(5, 3);
    api.floorCommand.mockReturnValueOnce(new Subject<void>());
    drag(el, 'Width', 8);
    release(el, 'Width');
    drag(el, 'Height', 4);
    release(el, 'Height');
    await fixture.whenStable();
    expect(api.floorCommand.mock.calls).toEqual([
      [{ width: 8, height: 3 }],
      [{ width: 8, height: 4 }],
    ]);
    expect(el.querySelectorAll('app-cell').length).toBe(32);
  });

  it('a late response to an earlier release is ignored', async () => {
    const { fixture, el, errors } = await render(5, 3);
    const first = new Subject<void>();
    api.floorCommand.mockReturnValueOnce(first);
    drag(el, 'Width', 8);
    release(el, 'Width');
    drag(el, 'Height', 4);
    await fixture.whenStable();
    release(el, 'Height');
    await fixture.whenStable();

    first.error(new HttpErrorResponse({ status: 400 }));
    await fixture.whenStable();
    expect(errors).toEqual([]);
    expect(slider(el, 'Width').value).toBe('8');
    expect(slider(el, 'Height').value).toBe('4');
    expect(el.querySelectorAll('app-cell').length).toBe(32);
  });

  /** The cell element at x, y. In makeCells, Id = y * width + x + 1. */
  function cellAt(el: HTMLElement, x: number, y: number): HTMLElement {
    return el.querySelector<HTMLElement>(`app-cell[data-x="${x}"][data-y="${y}"] .cell`)!;
  }

  function robotAt(el: HTMLElement, x: number, y: number): HTMLElement | null {
    return el.querySelector<HTMLElement>(`app-cell[data-x="${x}"][data-y="${y}"] app-robot`);
  }

  describe('edit mode', () => {
    it('cell click → obstacleCommand(x, y); the cell flips after success', async () => {
      const { fixture, el } = await render(3, 3, true);
      cellAt(el, 2, 1).click();
      await fixture.whenStable();
      expect(api.obstacleCommand).toHaveBeenCalledExactlyOnceWith(2, 1);
      expect(cellAt(el, 2, 1).classList).toContain('obstacle');
      expect(cellAt(el, 1, 0).classList).not.toContain('obstacle');

      api.obstacleCommand.mockClear();
      cellAt(el, 1, 0).click();
      await fixture.whenStable();
      cellAt(el, 1, 0).click();
      await fixture.whenStable();
      expect(api.obstacleCommand.mock.calls).toEqual([
        [1, 0],
        [1, 0],
      ]);
      expect(cellAt(el, 1, 0).classList).not.toContain('obstacle');
    });

    it('the cell does not change before the request succeeds', async () => {
      const { fixture, el } = await render(3, 3, true);
      api.obstacleCommand.mockReturnValueOnce(new Subject<void>());
      cellAt(el, 1, 0).click();
      await fixture.whenStable();
      expect(cellAt(el, 1, 0).classList).not.toContain('obstacle');
    });

    it('request fails → the cell is unchanged', async () => {
      const { fixture, el } = await render(3, 3, true);
      api.obstacleCommand.mockReturnValueOnce(
        throwError(() => new HttpErrorResponse({ status: 500 })),
      );
      cellAt(el, 1, 0).click();
      await fixture.whenStable();
      expect(cellAt(el, 1, 0).classList).not.toContain('obstacle');
    });

    it('edit mode off, cell click → no obstacle request', async () => {
      const { fixture, el } = await render(3, 3, false);
      cellAt(el, 1, 0).click();
      await fixture.whenStable();
      expect(api.obstacleCommand).not.toHaveBeenCalled();
    });

    it('click a cell with a robot → no request; the cell is unchanged', async () => {
      robots = [robot(9, 2, 1, 0)];
      const { fixture, el } = await render(3, 3, true);
      cellAt(el, 1, 0).click();
      await fixture.whenStable();
      expect(api.obstacleCommand).not.toHaveBeenCalled();
      expect(api.placeCommand).not.toHaveBeenCalled();
      expect(cellAt(el, 1, 0).classList).not.toContain('obstacle');
    });

    it('passes edit mode on to the cells', async () => {
      const { el } = await render(3, 3, true);
      expect(cellAt(el, 0, 0).classList).toContain('border-[#f08c00]');
    });
  });

  describe('resetFloor', () => {
    it('shows the returned 5×5 floor, its cells and no robots', async () => {
      obstacleIds = [3];
      robots = [robot(9, 2, 1, 0)];
      const { fixture, el } = await render(8, 6);
      expect(cellAt(el, 2, 0).classList).toContain('obstacle');
      expect(robotAt(el, 1, 0)).not.toBeNull();

      let done = false;
      fixture.componentInstance.resetFloor().subscribe(() => (done = true));
      await fixture.whenStable();

      expect(done).toBe(true);
      expect(api.resetFloor).toHaveBeenCalledExactlyOnceWith(1);
      expect(el.querySelectorAll('app-cell')).toHaveLength(25);
      expect(el.querySelectorAll('.cell.obstacle')).toHaveLength(0);
      expect(el.querySelectorAll('app-robot')).toHaveLength(0);
      expect(slider(el, 'Width').value).toBe('5');
      expect(slider(el, 'Height').value).toBe('5');
    });

    it('a resize still in flight is dropped by a reset', async () => {
      const { fixture, el } = await render(5, 5);
      const pending = new Subject<void>();
      api.floorCommand.mockReturnValueOnce(pending);
      drag(el, 'Width', 8);
      release(el, 'Width');
      await fixture.whenStable();
      fixture.componentInstance.resetFloor().subscribe();
      await fixture.whenStable();
      server = { id: 1, width: 8, height: 5 };
      pending.next();
      pending.complete();
      await fixture.whenStable();
      expect(el.querySelectorAll('app-cell')).toHaveLength(25);
      expect(slider(el, 'Width').value).toBe('5');
    });

    it('a failed reset keeps the shown floor and errors the returned observable', async () => {
      const { fixture, el } = await render(8, 6);
      api.resetFloor.mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 0 })));
      let failed = false;
      fixture.componentInstance.resetFloor().subscribe({ error: () => (failed = true) });
      await fixture.whenStable();
      expect(failed).toBe(true);
      expect(el.querySelectorAll('app-cell')).toHaveLength(48);
    });
  });

  describe('robots', () => {
    it('empty cell click (edit off, nothing selected) → placeCommand(x, y, North), then GET /robots renders R<displayId> with ^', async () => {
      const { fixture, el } = await render(3, 3);
      api.getRobots.mockClear();
      cellAt(el, 2, 1).click();
      await fixture.whenStable();
      expect(api.placeCommand).toHaveBeenCalledExactlyOnceWith(2, 1, Direction.North);
      expect(api.getRobots).toHaveBeenCalledTimes(1);
      const placed = robotAt(el, 2, 1)!;
      expect(placed.querySelector('.robot-id')!.textContent!.trim()).toBe('R40');
      expect(placed.querySelector('.robot-arrow')!.textContent!.trim()).toBe('^');
    });

    it('Shift+Click with nothing selected → the normal place, no gotoRequested', async () => {
      const { fixture, el } = await render(3, 3);
      const gotos: unknown[] = [];
      fixture.componentInstance.gotoRequested.subscribe((at) => gotos.push(at));
      cellAt(el, 2, 1).dispatchEvent(new MouseEvent('click', { shiftKey: true }));
      await fixture.whenStable();
      expect(api.placeCommand).toHaveBeenCalledExactlyOnceWith(2, 1, Direction.North);
      expect(gotos).toEqual([]);
    });

    it('removeRobot(id) → that robot is no longer rendered; others stay', async () => {
      robots = [robot(3, 1, 0, 0), robot(4, 9, 2, 2)];
      const { fixture, el } = await render(3, 3);
      fixture.componentInstance.removeRobot(3);
      await fixture.whenStable();
      expect(robotAt(el, 0, 0)).toBeNull();
      expect(robotAt(el, 2, 2)).not.toBeNull();
    });

    it('Obstacle cell click → no place request', async () => {
      const { fixture, el } = await render(3, 3, true);
      cellAt(el, 2, 1).click();
      await fixture.whenStable();
      fixture.componentRef.setInput('editMode', false);
      await fixture.whenStable();
      cellAt(el, 2, 1).click();
      await fixture.whenStable();
      expect(api.placeCommand).not.toHaveBeenCalled();
    });

    it('occupied cell click → no place request', async () => {
      robots = [robot(9, 6, 2, 1)];
      const { fixture, el } = await render(3, 3);
      cellAt(el, 2, 1).click();
      await fixture.whenStable();
      expect(api.placeCommand).not.toHaveBeenCalled();
    });

    it('place request fails → no robot renders and the placement error is emitted', async () => {
      const { fixture, el, errors } = await render(3, 3);
      api.placeCommand.mockReturnValueOnce(
        throwError(() => new HttpErrorResponse({ status: 400 })),
      );
      cellAt(el, 2, 1).click();
      await fixture.whenStable();
      expect(el.querySelector('app-robot')).toBeNull();
      expect(PLACE_ERROR).toBe('Robot failed to place.');
      expect(errors).toEqual([PLACE_ERROR]);
    });

    it('init GET /robots → robots render at their cell x/y with their direction', async () => {
      robots = [robot(3, 1, 0, 0, Direction.East), robot(4, 9, 2, 2, Direction.West)];
      const { el } = await render(3, 3);
      expect(api.getRobots).toHaveBeenCalledTimes(1);
      expect(robotAt(el, 0, 0)!.querySelector('.robot-id')!.textContent!.trim()).toBe('R3');
      expect(robotAt(el, 0, 0)!.querySelector('.robot-arrow')!.textContent!.trim()).toBe('>');
      expect(robotAt(el, 2, 2)!.querySelector('.robot-id')!.textContent!.trim()).toBe('R4');
      expect(robotAt(el, 2, 2)!.querySelector('.robot-arrow')!.textContent!.trim()).toBe('<');
      expect(el.querySelectorAll('app-robot').length).toBe(2);
    });

    it('GET /robots fails → emits SERVER_ERROR', async () => {
      api.getRobots.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 0 })));
      const { errors } = await render(3, 3);
      expect(errors).toEqual([SERVER_ERROR]);
    });

    it('a successful resize reloads robots, so robots the API moved show on their new cells', async () => {
      robots = [robot(3, 9, 2, 2)];
      const { fixture, el } = await render(3, 3);
      robots = [robot(3, 4, 1, 1)];
      drag(el, 'Width', 2);
      release(el, 'Width');
      await fixture.whenStable();
      expect(robotAt(el, 1, 1)!.querySelector('.robot-id')!.textContent!.trim()).toBe('R3');
      expect(el.querySelectorAll('app-robot').length).toBe(1);
    });

    it.each([true, false])(
      'robot click with edit mode %s → emits robotClicked; no obstacle or place request',
      async (editMode) => {
        robots = [robot(9, 6, 2, 1)];
        const { fixture, el } = await render(3, 3, editMode);
        const clicked: number[] = [];
        fixture.componentInstance.robotClicked.subscribe((id) => clicked.push(id));
        robotAt(el, 2, 1)!.click();
        await fixture.whenStable();
        expect(clicked).toEqual([9]);
        expect(api.obstacleCommand).not.toHaveBeenCalled();
        expect(api.placeCommand).not.toHaveBeenCalled();
      },
    );

    describe('selected robot', () => {
      async function renderSelected() {
        robots = [robot(3, 1, 0, 0, Direction.East)];
        const rendered = await render(3, 3);
        rendered.fixture.componentRef.setInput('selectedRobotId', 3);
        await rendered.fixture.whenStable();
        api.getRobots.mockClear();
        return rendered;
      }

      it('empty Open cell click → placeCommand with its displayId and direction; it moves and stays selected', async () => {
        const { fixture, el } = await renderSelected();
        cellAt(el, 2, 1).click();
        await fixture.whenStable();
        expect(api.placeCommand).toHaveBeenCalledExactlyOnceWith(2, 1, Direction.East, 3);
        expect(api.getRobots).toHaveBeenCalledTimes(1);
        expect(robotAt(el, 0, 0)).toBeNull();
        const moved = robotAt(el, 2, 1)!;
        expect(moved.querySelector('.robot-arrow')!.textContent!.trim()).toBe('>');
        expect(moved.querySelector('.robot')!.classList).toContain('border-green-300');
      });

      it('Obstacle cell click → no request', async () => {
        obstacleIds = [6];
        const { fixture, el } = await renderSelected();
        cellAt(el, 2, 1).click();
        await fixture.whenStable();
        expect(api.placeCommand).not.toHaveBeenCalled();
      });

      it('occupied cell click → no request', async () => {
        robots = [robot(3, 1, 0, 0, Direction.East), robot(4, 6, 2, 1)];
        const { fixture, el } = await render(3, 3);
        fixture.componentRef.setInput('selectedRobotId', 3);
        await fixture.whenStable();
        cellAt(el, 2, 1).click();
        await fixture.whenStable();
        expect(api.placeCommand).not.toHaveBeenCalled();
      });

      describe('Shift+Click', () => {
        const shiftClick = (el: HTMLElement, x: number, y: number) =>
          cellAt(el, x, y).dispatchEvent(new MouseEvent('click', { shiftKey: true }));

        async function renderWatched() {
          const rendered = await renderSelected();
          const gotos: { x: number; y: number }[] = [];
          rendered.fixture.componentInstance.gotoRequested.subscribe((at) => gotos.push(at));
          return { ...rendered, gotos };
        }

        it('on an empty Open cell → gotoRequested emits x/y; no place request', async () => {
          const { fixture, el, gotos } = await renderWatched();
          shiftClick(el, 2, 1);
          await fixture.whenStable();
          expect(gotos).toEqual([{ x: 2, y: 1 }]);
          expect(api.placeCommand).not.toHaveBeenCalled();
          expect(robotAt(el, 0, 0)).not.toBeNull();
        });

        it('on an Obstacle cell → no emit, no request', async () => {
          obstacleIds = [6];
          const { fixture, el, gotos } = await renderWatched();
          shiftClick(el, 2, 1);
          await fixture.whenStable();
          expect(gotos).toEqual([]);
          expect(api.placeCommand).not.toHaveBeenCalled();
        });

        it('on an occupied cell → no emit, no request', async () => {
          robots = [robot(3, 1, 0, 0, Direction.East), robot(4, 6, 2, 1)];
          const { fixture, el } = await render(3, 3);
          fixture.componentRef.setInput('selectedRobotId', 3);
          await fixture.whenStable();
          const gotos: unknown[] = [];
          fixture.componentInstance.gotoRequested.subscribe((at) => gotos.push(at));
          shiftClick(el, 2, 1);
          await fixture.whenStable();
          expect(gotos).toEqual([]);
          expect(api.placeCommand).not.toHaveBeenCalled();
        });

        it('in edit mode → the normal obstacle toggle, no emit', async () => {
          const { fixture, el, gotos } = await renderWatched();
          fixture.componentRef.setInput('editMode', true);
          await fixture.whenStable();
          shiftClick(el, 2, 1);
          await fixture.whenStable();
          expect(api.obstacleCommand).toHaveBeenCalledExactlyOnceWith(2, 1);
          expect(gotos).toEqual([]);
        });
      });

      it('failure → it stays put and the placement error is emitted', async () => {
        const { fixture, el, errors } = await renderSelected();
        api.placeCommand.mockReturnValueOnce(
          throwError(() => new HttpErrorResponse({ status: 400 })),
        );
        cellAt(el, 2, 1).click();
        await fixture.whenStable();
        expect(robotAt(el, 0, 0)).not.toBeNull();
        expect(robotAt(el, 2, 1)).toBeNull();
        expect(errors).toEqual([PLACE_ERROR]);
      });
    });

    it('the robot with selectedRobotId gets the selected border', async () => {
      robots = [robot(9, 6, 2, 1), robot(10, 1, 0, 0)];
      const { fixture, el } = await render(3, 3);
      fixture.componentRef.setInput('selectedRobotId', 9);
      await fixture.whenStable();
      expect(robotAt(el, 2, 1)!.querySelector('.robot')!.classList).toContain('border-green-300');
      expect(robotAt(el, 0, 0)!.querySelector('.robot')!.classList).toContain('border-blue-900');
    });
  });

  describe('tick', () => {
    it('a tick change reloads the robots and renders their new cells and directions', async () => {
      robots = [robot(3, 1, 0, 0)];
      const { fixture, el } = await render(3, 3);
      robots = [robot(3, 4, 0, 1, Direction.East)];
      fixture.componentRef.setInput('tick', 1);
      await fixture.whenStable();
      expect(api.getRobots).toHaveBeenCalledTimes(2);
      expect(robotAt(el, 0, 0)).toBeNull();
      expect(robotAt(el, 0, 1)!.querySelector('.robot-arrow')!.textContent!.trim()).toBe('>');
    });

    it('no tick change → no reload', async () => {
      const { fixture } = await render(3, 3);
      await fixture.whenStable();
      expect(api.getRobots).toHaveBeenCalledTimes(1);
    });

    it('a failed reload shows the server error', async () => {
      const { fixture, errors } = await render(3, 3);
      api.getRobots.mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 0 })));
      fixture.componentRef.setInput('tick', 1);
      await fixture.whenStable();
      expect(errors).toEqual([SERVER_ERROR]);
    });
  });

  describe('floors and history', () => {
    const second: Floor = { id: 2, width: 3, height: 2 };
    const cellEl = (el: HTMLElement, x: number, y: number) =>
      el.querySelector<HTMLElement>(`app-cell[data-x="${x}"][data-y="${y}"] .cell`)!;
    const robotEl = (el: HTMLElement, x: number, y: number) =>
      el.querySelector<HTMLElement>(`app-cell[data-x="${x}"][data-y="${y}"] app-robot`);

    beforeEach(() => {
      others = [second];
      otherRobots = new Map([[2, [robot(5, 4, 0, 1)]]]);
    });

    async function renderWith(inputs: { floorId?: number | null; viewTick?: number | null }) {
      server = { id: 1, width: 3, height: 3 };
      const fixture = TestBed.createComponent(Grid);
      for (const [name, value] of Object.entries(inputs)) {
        fixture.componentRef.setInput(name, value);
      }
      const shown: Floor[] = [];
      fixture.componentInstance.floorShown.subscribe((f) => shown.push(f));
      let historyShown = 0;
      fixture.componentInstance.historyShown.subscribe(() => historyShown++);
      await fixture.whenStable();
      const el = fixture.nativeElement as HTMLElement;
      return { fixture, el, shown, historyShown: () => historyShown };
    }

    async function set(fixture: ComponentFixture<Grid>, name: string, value: unknown) {
      fixture.componentRef.setInput(name, value);
      await fixture.whenStable();
    }

    it('init shows the floor matching floorId when it is not the first', async () => {
      const { el, shown } = await renderWith({ floorId: 2 });
      expect(el.querySelectorAll('app-cell')).toHaveLength(6);
      expect(api.getCells).toHaveBeenLastCalledWith(2);
      expect(api.getRobots).toHaveBeenLastCalledWith(2);
      expect(robotEl(el, 0, 1)).not.toBeNull();
      expect(shown).toEqual([second]);
    });

    it("floorId change loads that floor's cells and robots", async () => {
      const { fixture, el, shown } = await renderWith({ floorId: 1 });
      expect(el.querySelectorAll('app-cell')).toHaveLength(9);
      await set(fixture, 'floorId', 2);
      expect(el.querySelectorAll('app-cell')).toHaveLength(6);
      expect(api.getRobots).toHaveBeenLastCalledWith(2);
      expect(shown.map((f) => f.id)).toEqual([1, 2]);
    });

    it('viewTick 5 requests getFloorState(floorId, 5) and renders its cells, obstacles and robots', async () => {
      const { fixture, el, historyShown } = await renderWith({ floorId: 1 });
      await set(fixture, 'viewTick', 5);
      expect(api.getFloorState).toHaveBeenCalledExactlyOnceWith(1, 5);
      expect(el.querySelectorAll('app-cell')).toHaveLength(4);
      expect(cellEl(el, 1, 0).classList).toContain('obstacle');
      expect(robotEl(el, 0, 1)!.querySelector('.robot-id')!.textContent!.trim()).toBe('R3');
      expect(robotEl(el, 0, 1)!.querySelector('.robot-arrow')!.textContent!.trim()).toBe('>');
      expect(historyShown()).toBe(1);
    });

    it('a newer viewTick cancels an older history request', async () => {
      const first = new Subject<FloorState>();
      api.getFloorState.mockReturnValueOnce(first);
      const { fixture, el } = await renderWith({ floorId: 1 });
      await set(fixture, 'viewTick', 2);
      await set(fixture, 'viewTick', 5);
      first.next({ width: 1, height: 1, cells: [{ x: 0, y: 0, obstacle: false }], robots: [] });
      await fixture.whenStable();
      expect(el.querySelectorAll('app-cell')).toHaveLength(4);
    });

    it.each([true, false])(
      'read-only (edit mode %s): cell click sends nothing; sliders are disabled',
      async (editMode) => {
        const { fixture, el } = await renderWith({ floorId: 1, viewTick: 5 });
        await set(fixture, 'editMode', editMode);
        cellEl(el, 0, 0).click();
        await fixture.whenStable();
        expect(api.obstacleCommand).not.toHaveBeenCalled();
        expect(api.placeCommand).not.toHaveBeenCalled();
        expect(slider(el, 'Width').disabled).toBe(true);
        expect(slider(el, 'Height').disabled).toBe(true);
      },
    );

    it('read-only: robot click still emits robotClicked', async () => {
      const { fixture, el } = await renderWith({ floorId: 1, viewTick: 5 });
      const clicked: number[] = [];
      fixture.componentInstance.robotClicked.subscribe((id) => clicked.push(id));
      robotEl(el, 0, 1)!.click();
      // R3 is not on the live floor, so it gets the history-only id -3.
      expect(clicked).toEqual([-3]);
    });

    it('read-only: a tick change does not reload robots', async () => {
      const { fixture } = await renderWith({ floorId: 1, viewTick: 5 });
      api.getRobots.mockClear();
      await set(fixture, 'tick', 7);
      expect(api.getRobots).not.toHaveBeenCalled();
    });

    it('viewTick back to null reloads the live floor', async () => {
      const { fixture, el, shown } = await renderWith({ floorId: 1, viewTick: 5 });
      expect(el.querySelectorAll('app-cell')).toHaveLength(4);
      await set(fixture, 'viewTick', null);
      expect(el.querySelectorAll('app-cell')).toHaveLength(9);
      expect(slider(el, 'Width').disabled).toBe(false);
      expect(shown.at(-1)).toEqual(server);
    });

    it('a tick reload that answers after a floor switch is ignored', async () => {
      const { fixture, el } = await renderWith({ floorId: 1 });
      const late = new Subject<Robot[]>();
      api.getRobots.mockReturnValueOnce(late);
      fixture.componentRef.setInput('tick', 1);
      fixture.componentRef.setInput('floorId', 2);
      await fixture.whenStable();
      late.next([robot(77, 1, 0, 0)]);
      await fixture.whenStable();
      expect(el.querySelectorAll('app-cell')).toHaveLength(6);
      expect(el.querySelectorAll('app-robot')).toHaveLength(1);
      expect(robotEl(el, 0, 1)).not.toBeNull();
    });

    it("historyQueue returns the robot's queue at that tick", async () => {
      const { fixture } = await renderWith({ floorId: 1, viewTick: 5 });
      const grid = fixture.componentInstance;
      expect(grid.historyQueue(-3).map((q) => q.command)).toEqual(['MOVE', 'LEFT']);
      expect(grid.historyQueue(1)).toEqual([]);
      await set(fixture, 'viewTick', null);
      expect(grid.historyQueue(-3)).toEqual([]);
    });

    it("a past robot takes the live id of the robot with its displayId (the state's id can differ)", async () => {
      // Live R3 is robot 50; the replayed state calls it robot 9.
      robots = [{ id: 50, displayId: 3, direction: Direction.North, cellId: 1, x: 0, y: 0 }];
      const { fixture, el } = await renderWith({ floorId: 1, viewTick: 5 });
      expect(api.getRobots).toHaveBeenLastCalledWith(1);
      const clicked: number[] = [];
      fixture.componentInstance.robotClicked.subscribe((id) => clicked.push(id));
      robotEl(el, 0, 1)!.click();
      expect(clicked).toEqual([50]);
      expect(fixture.componentInstance.historyQueue(50).map((q) => q.command)).toEqual([
        'MOVE',
        'LEFT',
      ]);
      expect(fixture.componentInstance.historyQueue(9)).toEqual([]);
    });

    it('a selected live robot stays selected in the past view', async () => {
      robots = [{ id: 50, displayId: 3, direction: Direction.North, cellId: 1, x: 0, y: 0 }];
      const { fixture, el } = await renderWith({ floorId: 1 });
      await set(fixture, 'selectedRobotId', 50);
      await set(fixture, 'viewTick', 5);
      expect(robotEl(el, 0, 1)!.querySelector('.robot')!.classList).toContain('border-green-300');
    });
  });
});
