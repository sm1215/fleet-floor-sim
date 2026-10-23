import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { of, Subject, throwError } from 'rxjs';
import { stubDialog } from '../testing/dialog-stub';
import { App } from './app';
import { Grid } from './components/grid/grid';
import { Cell } from './models/cell.model';
import { Direction } from './models/direction';
import { EngineState } from './models/engine-state.model';
import { FloorState } from './models/floor-state.model';
import { QueuedCommand } from './models/queued-command.model';
import { SimulationApiService } from './services/simulation-api.service';

const queues: Record<number, QueuedCommand[]> = {
  7: [
    { id: 1, command: 'MOVE', params: null, robotId: 7 },
    { id: 2, command: 'LEFT', params: null, robotId: 7 },
  ],
  8: [{ id: 3, command: 'RIGHT', params: null, robotId: 8 }],
};

function buttonNamed(el: HTMLElement, text: string): HTMLButtonElement | undefined {
  return Array.from(el.querySelectorAll('button')).find((b) => b.textContent?.trim() === text);
}

function robotEl(el: HTMLElement, id: number): HTMLElement {
  return Array.from(el.querySelectorAll<HTMLElement>('app-robot')).find(
    (r) => r.querySelector('.robot-id')?.textContent?.trim() === `R${id}`,
  )!;
}

function queueItems(el: HTMLElement): string[] {
  return Array.from(el.querySelectorAll('app-queue-panel li')).map((li) => li.textContent!.trim());
}

function makeCells(width: number, height: number): Cell[] {
  const cells: Cell[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      cells.push({ id: cells.length + 1, obstacle: false, xPosition: x, yPosition: y, floorId: 1 });
    }
  }
  return cells;
}

function engineState(change: Partial<EngineState> = {}): EngineState {
  return { floorId: 1, currentTick: 0, tickRate: 1000, running: false, errors: [], ...change };
}

describe('App', () => {
  beforeAll(stubDialog);

  let api: Record<
    | 'getFloors'
    | 'floorCommand'
    | 'resetFloor'
    | 'getCells'
    | 'obstacleCommand'
    | 'getRobots'
    | 'placeCommand'
    | 'deleteCommand'
    | 'getQueuedCommands'
    | 'queueCommand'
    | 'gotoCommand'
    | 'getLogEntries'
    | 'getEngine'
    | 'stepEngine'
    | 'toggleEngine'
    | 'selectFloor'
    | 'getFloorState'
    | 'forkFloor'
    | 'deleteFloor',
    ReturnType<typeof vi.fn>
  >;

  beforeEach(() => {
    api = {
      getFloors: vi.fn(() => of([{ id: 1, width: 5, height: 5 }])),
      floorCommand: vi.fn(() => of(undefined)),
      resetFloor: vi.fn(() => of({ id: 1, width: 10, height: 8 })),
      getCells: vi.fn(() => of(makeCells(5, 5))),
      obstacleCommand: vi.fn(() => of(undefined)),
      getRobots: vi.fn(() =>
        of([
          { id: 7, displayId: 7, direction: Direction.North, cellId: 1, x: 0, y: 0 },
          { id: 8, displayId: 8, direction: Direction.East, cellId: 2, x: 1, y: 0 },
        ]),
      ),
      placeCommand: vi.fn(() => of(undefined)),
      deleteCommand: vi.fn(() => of(undefined)),
      getQueuedCommands: vi.fn((robotId: number) => of(queues[robotId] ?? [])),
      queueCommand: vi.fn(() => of(undefined)),
      gotoCommand: vi.fn(() => of(undefined)),
      getLogEntries: vi.fn(() => of([])),
      getEngine: vi.fn(() => of(engineState())),
      stepEngine: vi.fn(() => of(engineState({ currentTick: 1 }))),
      toggleEngine: vi.fn(() => of(engineState({ running: true }))),
      selectFloor: vi.fn(() => of(engineState())),
      getFloorState: vi.fn(),
      forkFloor: vi.fn(),
      deleteFloor: vi.fn(),
    };
    TestBed.configureTestingModule({
      providers: [{ provide: SimulationApiService, useValue: api }],
    });
  });

  async function setup() {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    return fixture;
  }

  it('renders the loaded floor', async () => {
    const fixture = await setup();
    expect((fixture.nativeElement as HTMLElement).querySelectorAll('app-cell').length).toBe(25);
  });

  it.each([
    ['ArrowLeft', 'onTurnLeft'],
    ['ArrowRight', 'onTurnRight'],
    ['ArrowUp', 'onMove'],
  ] as const)('%s calls %s', async (key, handler) => {
    const fixture = await setup();
    const spy = vi.spyOn(fixture.componentInstance, handler);
    document.dispatchEvent(new KeyboardEvent('keydown', { key }));
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('prevents the default action (page scroll) for handled arrow keys', async () => {
    await setup();
    const event = new KeyboardEvent('keydown', { key: 'ArrowUp', cancelable: true });
    document.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });

  it.each(['altKey', 'ctrlKey', 'metaKey', 'shiftKey'] as const)(
    'ignores arrow keys with %s held',
    async (modifier) => {
      const fixture = await setup();
      const spy = vi.spyOn(fixture.componentInstance, 'onMove');
      const event = new KeyboardEvent('keydown', {
        key: 'ArrowUp',
        cancelable: true,
        [modifier]: true,
      });
      document.dispatchEvent(event);
      expect(spy).not.toHaveBeenCalled();
      expect(event.defaultPrevented).toBe(false);
    },
  );

  it.each(['input', 'textarea'])('ignores arrow keys typed in a %s', async (tag) => {
    const fixture = await setup();
    const spy = vi.spyOn(fixture.componentInstance, 'onMove');
    const field = document.createElement(tag);
    document.body.appendChild(field);
    field.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    field.remove();
    expect(spy).not.toHaveBeenCalled();
  });

  it('ignores arrow keys typed in a contenteditable element', async () => {
    const fixture = await setup();
    const spy = vi.spyOn(fixture.componentInstance, 'onMove');
    const field = document.createElement('div');
    // jsdom does not implement isContentEditable.
    Object.defineProperty(field, 'isContentEditable', { value: true });
    document.body.appendChild(field);
    field.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    field.remove();
    expect(spy).not.toHaveBeenCalled();
  });

  it('ignores arrow keys while the log modal is open', async () => {
    const fixture = await setup();
    const el = fixture.nativeElement as HTMLElement;
    Array.from(el.querySelectorAll('button'))
      .find((b) => b.textContent?.trim() === 'Log')!
      .click();
    await fixture.whenStable();
    const spy = vi.spyOn(fixture.componentInstance, 'onMove');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp' }));
    expect(spy).not.toHaveBeenCalled();
  });

  it('opens the log modal from Log and closes it on X', async () => {
    const fixture = await setup();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('app-log-modal')).toBeNull();

    const logButton = Array.from(el.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Log',
    )!;
    logButton.click();
    await fixture.whenStable();
    expect(el.querySelector('app-log-modal')).not.toBeNull();

    el.querySelector<HTMLButtonElement>('button[aria-label="Close"]')!.click();
    await fixture.whenStable();
    expect(el.querySelector('app-log-modal')).toBeNull();
  });

  it('opening Log twice fetches the log each time', async () => {
    const fixture = await setup();
    const el = fixture.nativeElement as HTMLElement;
    for (let i = 0; i < 2; i++) {
      buttonNamed(el, 'Log')!.click();
      await fixture.whenStable();
      el.querySelector<HTMLButtonElement>('button[aria-label="Close"]')!.click();
      await fixture.whenStable();
    }
    expect(api.getLogEntries).toHaveBeenCalledTimes(2);
  });

  describe('errors', () => {
    async function withErrors(...texts: string[]) {
      const fixture = await setup();
      const grid = fixture.debugElement.query(By.directive(Grid)).componentInstance as Grid;
      for (const text of texts) grid.gridError.emit(text);
      await fixture.whenStable();
      return { fixture, el: fixture.nativeElement as HTMLElement };
    }

    function errorTexts(el: HTMLElement): string[] {
      return Array.from(el.querySelectorAll('.area-errors li')).map((li) =>
        li.textContent!.replace('×', '').trim(),
      );
    }

    function clearButton(el: HTMLElement): HTMLButtonElement | undefined {
      return Array.from(el.querySelectorAll('button')).find(
        (b) => b.textContent?.trim() === 'Clear errors',
      );
    }

    it('error text is red and sits below the grid and above the movement controls', async () => {
      const { el } = await withErrors('first');
      const li = el.querySelector('.area-errors li')!;
      expect(li.closest('ul')!.classList).toContain('text-red-600');
      const list = el.querySelector('.area-errors ul')!;
      const grid = el.querySelector('app-grid')!;
      const turnLeft = Array.from(el.querySelectorAll('button')).find(
        (b) => b.textContent?.trim() === 'Turn Left',
      )!;
      expect(grid.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(
        list.compareDocumentPosition(turnLeft) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    });

    it('two errors → both show', async () => {
      const { el } = await withErrors('first', 'second');
      expect(errorTexts(el)).toEqual(['first', 'second']);
    });

    it('X removes only that error', async () => {
      const { fixture, el } = await withErrors('first', 'second');
      el.querySelectorAll<HTMLButtonElement>('button[aria-label="Dismiss error"]')[0].click();
      await fixture.whenStable();
      expect(errorTexts(el)).toEqual(['second']);
    });

    it('list has max-h-[50px] and overflow-y-auto', async () => {
      const { el } = await withErrors('first');
      const list = el.querySelector('.area-errors ul')!;
      expect(list.classList).toContain('max-h-[50px]');
      expect(list.classList).toContain('overflow-y-auto');
    });

    it('Clear errors hidden with one error, shown with two, click empties the list', async () => {
      const one = await withErrors('first');
      expect(clearButton(one.el)).toBeUndefined();
      one.fixture.destroy();

      const { fixture, el } = await withErrors('first', 'second');
      clearButton(el)!.click();
      await fixture.whenStable();
      expect(errorTexts(el)).toEqual([]);
      expect(clearButton(el)).toBeUndefined();
    });

    it('an unreachable server on load shows the server error', async () => {
      api.getFloors.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 0 })));
      const fixture = await setup();
      expect(errorTexts(fixture.nativeElement as HTMLElement)).toEqual(["Server can't be reached"]);
    });

    it('a rejected (400) resize shows the exact text', async () => {
      api.floorCommand.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 400 })));
      const fixture = await setup();
      const el = fixture.nativeElement as HTMLElement;
      const width = el.querySelector<HTMLInputElement>('input[aria-label="Width"]')!;
      width.value = '1';
      width.dispatchEvent(new Event('input'));
      width.dispatchEvent(new Event('change'));
      await fixture.whenStable();
      expect(errorTexts(el)).toEqual(["Can't resize grid, not enough space for existing robots"]);
    });

    it('a failed command POST shows "Command failed to queue." and leaves the panel unchanged', async () => {
      api.queueCommand.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 400 })));
      const fixture = await setup();
      const el = fixture.nativeElement as HTMLElement;
      robotEl(el, 7).click();
      await fixture.whenStable();
      buttonNamed(el, 'Move')!.click();
      await fixture.whenStable();
      expect(queueItems(el)).toEqual(['MOVE', 'LEFT']);
      expect(errorTexts(el)).toEqual(['Command failed to queue.']);
    });

    it('a failed delete shows "Robot failed to delete."; the robot stays selected', async () => {
      api.deleteCommand.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 400 })));
      const fixture = await setup();
      const el = fixture.nativeElement as HTMLElement;
      robotEl(el, 7).click();
      await fixture.whenStable();
      buttonNamed(el, 'Delete')!.click();
      await fixture.whenStable();
      expect(robotEl(el, 7)).toBeDefined();
      expect(robotEl(el, 7).querySelector('.robot')!.classList).toContain('border-green-300');
      expect(queueItems(el)).toEqual(['MOVE', 'LEFT']);
      expect(errorTexts(el)).toEqual(['Robot failed to delete.']);
    });

    it('a failed placement shows "Robot failed to place."', async () => {
      api.getRobots.mockReturnValue(of([]));
      api.placeCommand.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 400 })));
      const fixture = await setup();
      const el = fixture.nativeElement as HTMLElement;
      el.querySelector<HTMLElement>('app-cell .cell')!.click();
      await fixture.whenStable();
      expect(errorTexts(el)).toEqual(['Robot failed to place.']);
    });
  });

  describe('edit button', () => {
    function editButton(el: HTMLElement): HTMLButtonElement {
      return Array.from(el.querySelectorAll('button')).find((b) =>
        b.textContent?.trim().startsWith('Edit'),
      )!;
    }

    it('starts as "Edit: Off" with the locked icon and the normal border', async () => {
      const fixture = await setup();
      const button = editButton(fixture.nativeElement as HTMLElement);
      expect(button.textContent!.trim()).toBe('Edit: Off');
      expect(button.querySelector('svg')!.getAttribute('data-icon')).toBe('locked');
      expect(button.classList).toContain('border-[#1971c2]');
      expect(button.classList).not.toContain('border-[#f08c00]');
    });

    it('click → "Edit: On", unlocked icon, orange border; click again → off', async () => {
      const fixture = await setup();
      const el = fixture.nativeElement as HTMLElement;
      editButton(el).click();
      await fixture.whenStable();
      expect(editButton(el).textContent!.trim()).toBe('Edit: On');
      expect(editButton(el).querySelector('svg')!.getAttribute('data-icon')).toBe('unlocked');
      expect(editButton(el).classList).toContain('border-[#f08c00]');

      editButton(el).click();
      await fixture.whenStable();
      expect(editButton(el).textContent!.trim()).toBe('Edit: Off');
      expect(editButton(el).querySelector('svg')!.getAttribute('data-icon')).toBe('locked');
      expect(editButton(el).classList).toContain('border-[#1971c2]');
    });

    it('the icon sits left of the text and uses currentColor', async () => {
      const fixture = await setup();
      const button = editButton(fixture.nativeElement as HTMLElement);
      const svg = button.querySelector('svg')!;
      expect(svg.getAttribute('stroke')).toBe('currentColor');
      expect(button.firstElementChild).toBe(svg);
    });

    it('passes edit mode to the grid: a cell click toggles an obstacle instead of placing', async () => {
      const fixture = await setup();
      const el = fixture.nativeElement as HTMLElement;
      editButton(el).click();
      await fixture.whenStable();
      el.querySelector<HTMLElement>('app-cell .cell')!.click();
      await fixture.whenStable();
      expect(api.obstacleCommand).toHaveBeenCalledExactlyOnceWith(0, 4);
      expect(api.placeCommand).not.toHaveBeenCalled();
    });
  });

  describe('robots', () => {
    async function selected(...ids: number[]) {
      const fixture = await setup();
      const el = fixture.nativeElement as HTMLElement;
      for (const id of ids) {
        robotEl(el, id).click();
        await fixture.whenStable();
      }
      return { fixture, el };
    }

    function isSelected(el: HTMLElement, id: number): boolean {
      return robotEl(el, id).querySelector('.robot')!.classList.contains('border-green-300');
    }

    it('no selection → Move / Turn Left / Turn Right / Delete disabled; arrow keys send nothing', async () => {
      const { el } = await selected();
      for (const label of ['Move', 'Turn Left', 'Turn Right', 'Delete']) {
        expect(buttonNamed(el, label)!.disabled).toBe(true);
      }
      for (const key of ['ArrowLeft', 'ArrowRight', 'ArrowUp']) {
        document.dispatchEvent(new KeyboardEvent('keydown', { key }));
      }
      expect(api.queueCommand).not.toHaveBeenCalled();
    });

    it('a selection enables the command buttons', async () => {
      const { el } = await selected(7);
      for (const label of ['Move', 'Turn Left', 'Turn Right', 'Delete']) {
        expect(buttonNamed(el, label)!.disabled).toBe(false);
      }
    });

    it('click selects, click again deselects, click another switches', async () => {
      const { fixture, el } = await selected(7);
      expect(isSelected(el, 7)).toBe(true);

      robotEl(el, 7).click();
      await fixture.whenStable();
      expect(isSelected(el, 7)).toBe(false);

      robotEl(el, 7).click();
      await fixture.whenStable();
      robotEl(el, 8).click();
      await fixture.whenStable();
      expect(isSelected(el, 7)).toBe(false);
      expect(isSelected(el, 8)).toBe(true);
    });

    it('selects in edit mode too, with no obstacle request', async () => {
      const fixture = await setup();
      const el = fixture.nativeElement as HTMLElement;
      buttonNamed(el, 'Edit: Off')!.click();
      await fixture.whenStable();
      robotEl(el, 7).click();
      await fixture.whenStable();
      expect(isSelected(el, 7)).toBe(true);
      expect(api.obstacleCommand).not.toHaveBeenCalled();
    });

    it.each([
      ['Turn Left', 'LEFT'],
      ['Turn Right', 'RIGHT'],
      ['Move', 'MOVE'],
    ])('the %s button queues %s for the selected robot displayId', async (label, command) => {
      const { fixture, el } = await selected(8);
      buttonNamed(el, label)!.click();
      await fixture.whenStable();
      expect(api.queueCommand).toHaveBeenCalledExactlyOnceWith(8, command);
    });

    it('commands and Delete address the robot by displayId, not by id', async () => {
      api.getRobots.mockReturnValue(
        of([{ id: 7, displayId: 3, direction: Direction.North, cellId: 1, x: 0, y: 0 }]),
      );
      const { fixture, el } = await selected(3);
      buttonNamed(el, 'Move')!.click();
      await fixture.whenStable();
      expect(api.queueCommand).toHaveBeenCalledExactlyOnceWith(3, 'MOVE');
      expect(api.getQueuedCommands).toHaveBeenLastCalledWith(7);
      buttonNamed(el, 'Delete')!.click();
      await fixture.whenStable();
      expect(api.deleteCommand).toHaveBeenCalledExactlyOnceWith(3);
    });

    it.each([
      ['ArrowLeft', 'LEFT'],
      ['ArrowRight', 'RIGHT'],
      ['ArrowUp', 'MOVE'],
    ])('%s queues %s for the selected robot displayId', async (key, command) => {
      const { fixture } = await selected(7);
      document.dispatchEvent(new KeyboardEvent('keydown', { key }));
      await fixture.whenStable();
      expect(api.queueCommand).toHaveBeenCalledExactlyOnceWith(7, command);
    });

    it('selecting a robot → GET its queued commands; shown in order', async () => {
      const { el } = await selected(7);
      expect(api.getQueuedCommands).toHaveBeenCalledExactlyOnceWith(7);
      expect(queueItems(el)).toEqual(['MOVE', 'LEFT']);
    });

    it('switching robots shows the new queue; deselecting empties it', async () => {
      const { fixture, el } = await selected(7, 8);
      expect(queueItems(el)).toEqual(['RIGHT']);
      robotEl(el, 8).click();
      await fixture.whenStable();
      expect(queueItems(el)).toEqual([]);
    });

    it('queue success → the panel is refetched', async () => {
      const { fixture, el } = await selected(7);
      api.getQueuedCommands.mockReturnValueOnce(
        of([...queues[7], { id: 100, command: 'RIGHT', params: null, robotId: 7 }]),
      );
      buttonNamed(el, 'Turn Right')!.click();
      await fixture.whenStable();
      expect(queueItems(el)).toEqual(['MOVE', 'LEFT', 'RIGHT']);
    });

    it('a queue request that succeeds after switching robots does not reach the new panel', async () => {
      const pending = new Subject<void>();
      api.queueCommand.mockReturnValueOnce(pending);
      const { fixture, el } = await selected(7);
      buttonNamed(el, 'Move')!.click();
      robotEl(el, 8).click();
      await fixture.whenStable();
      pending.next();
      pending.complete();
      await fixture.whenStable();
      expect(queueItems(el)).toEqual(['RIGHT']);
    });

    it('Delete → deleteCommand for the selected robot; it leaves the grid, the selection and queue clear', async () => {
      const { fixture, el } = await selected(7);
      buttonNamed(el, 'Delete')!.click();
      await fixture.whenStable();
      expect(api.deleteCommand).toHaveBeenCalledExactlyOnceWith(7);
      expect(robotEl(el, 7)).toBeUndefined();
      expect(robotEl(el, 8)).toBeDefined();
      expect(queueItems(el)).toEqual([]);
      for (const label of ['Move', 'Turn Left', 'Turn Right', 'Delete']) {
        expect(buttonNamed(el, label)!.disabled).toBe(true);
      }
    });

    it('a delete that succeeds after switching robots keeps the new selection', async () => {
      const pending = new Subject<void>();
      api.deleteCommand.mockReturnValueOnce(pending);
      const { fixture, el } = await selected(7);
      buttonNamed(el, 'Delete')!.click();
      robotEl(el, 8).click();
      await fixture.whenStable();
      pending.next();
      pending.complete();
      await fixture.whenStable();
      expect(robotEl(el, 7)).toBeUndefined();
      expect(isSelected(el, 8)).toBe(true);
      expect(queueItems(el)).toEqual(['RIGHT']);
    });

    describe('GOTO', () => {
      const HINT = 'Shift + Click an empty cell to issue a GOTO command';
      const shiftClick = (el: HTMLElement, x: number, y: number) =>
        el
          .querySelector(`app-cell[data-x="${x}"][data-y="${y}"] .cell`)!
          .dispatchEvent(new MouseEvent('click', { shiftKey: true }));
      const errorTexts = (el: HTMLElement) =>
        Array.from(el.querySelectorAll('.area-errors li')).map((li) =>
          li.textContent!.replace('×', '').trim(),
        );

      it('Shift+Click → gotoCommand with the selected displayId and x/y; the panel is refetched', async () => {
        const { fixture, el } = await selected(8);
        api.getQueuedCommands.mockClear();
        api.getQueuedCommands.mockReturnValueOnce(
          of([...queues[8], { id: 100, command: 'GOTO', params: '3,4', robotId: 8 }]),
        );
        shiftClick(el, 3, 4);
        await fixture.whenStable();
        expect(api.gotoCommand).toHaveBeenCalledExactlyOnceWith(8, 3, 4);
        expect(api.placeCommand).not.toHaveBeenCalled();
        expect(api.getQueuedCommands).toHaveBeenCalledExactlyOnceWith(8);
        expect(queueItems(el)).toEqual(['RIGHT', 'GOTO 3,4']);
      });

      it('a failed GOTO shows "Command failed to queue." and leaves the panel unchanged', async () => {
        api.gotoCommand.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 400 })));
        const { fixture, el } = await selected(7);
        shiftClick(el, 3, 4);
        await fixture.whenStable();
        expect(queueItems(el)).toEqual(['MOVE', 'LEFT']);
        expect(errorTexts(el)).toEqual(['Command failed to queue.']);
      });

      it('the hint shows below the movement buttons only while a robot is selected', async () => {
        const { fixture, el } = await selected();
        expect(el.textContent).not.toContain(HINT);
        robotEl(el, 7).click();
        await fixture.whenStable();
        const hint = Array.from(el.querySelectorAll('.area-controls p')).find(
          (p) => p.textContent?.trim() === HINT,
        )!;
        expect(hint.classList).toContain('text-sm');
        const move = buttonNamed(el, 'Move')!;
        expect(move.compareDocumentPosition(hint) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      });

      it('the hint hides in edit mode, where Shift+Click toggles an obstacle', async () => {
        const { fixture, el } = await selected(7);
        buttonNamed(el, 'Edit: Off')!.click();
        await fixture.whenStable();
        expect(el.textContent).not.toContain(HINT);
        buttonNamed(el, 'Edit: On')!.click();
        await fixture.whenStable();
        expect(el.textContent).toContain(HINT);
      });
    });

    it('a queue that arrives after switching robots is ignored', async () => {
      const late = new Subject<QueuedCommand[]>();
      api.getQueuedCommands.mockReturnValueOnce(late);
      const { fixture, el } = await selected(7, 8);
      late.next(queues[7]);
      await fixture.whenStable();
      expect(queueItems(el)).toEqual(['RIGHT']);
    });
  });

  describe('engine', () => {
    function errorTexts(el: HTMLElement): string[] {
      return Array.from(el.querySelectorAll('.area-errors li')).map((li) =>
        li.textContent!.replace('×', '').trim(),
      );
    }

    afterEach(() => vi.useRealTimers());

    /** The Play / Pause button, whichever label it shows. */
    function playPause(el: HTMLElement): HTMLButtonElement {
      return (buttonNamed(el, 'Play') ?? buttonNamed(el, 'Pause'))!;
    }

    it('loads the engine state on start', async () => {
      await setup();
      expect(api.getEngine).toHaveBeenCalledTimes(1);
    });

    it('Step → POST /engine/step', async () => {
      const fixture = await setup();
      buttonNamed(fixture.nativeElement, 'Step')!.click();
      expect(api.stepEngine).toHaveBeenCalledTimes(1);
    });

    it('a failed step shows the API message under the grid', async () => {
      api.stepEngine.mockReturnValue(
        throwError(() => new HttpErrorResponse({ status: 500, error: { message: 'boom' } })),
      );
      const fixture = await setup();
      buttonNamed(fixture.nativeElement, 'Step')!.click();
      await fixture.whenStable();
      expect(errorTexts(fixture.nativeElement)).toEqual(['boom']);
    });

    it('an unreachable server on Step shows the server error', async () => {
      api.stepEngine.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 0 })));
      const fixture = await setup();
      buttonNamed(fixture.nativeElement, 'Step')!.click();
      await fixture.whenStable();
      expect(errorTexts(fixture.nativeElement)).toEqual(["Server can't be reached"]);
    });

    it('Step is disabled while running and re-enabled once paused', async () => {
      const fixture = await setup();
      const step = () => buttonNamed(fixture.nativeElement, 'Step')!;
      expect(step().disabled).toBe(false);

      playPause(fixture.nativeElement).click();
      await fixture.whenStable();
      expect(step().disabled).toBe(true);
      step().click();
      expect(api.stepEngine).not.toHaveBeenCalled();

      api.toggleEngine.mockReturnValue(of(engineState({ running: false })));
      playPause(fixture.nativeElement).click();
      await fixture.whenStable();
      expect(step().disabled).toBe(false);
    });

    it('Play → POST /engine/toggle', async () => {
      const fixture = await setup();
      playPause(fixture.nativeElement).click();
      expect(api.toggleEngine).toHaveBeenCalledTimes(1);
    });

    it('while running, polls GET /engine every tickRate ms and shows its errors', async () => {
      vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
      const fixture = await setup();
      api.getEngine.mockReturnValue(of(engineState({ running: true, errors: ['boom'] })));
      playPause(fixture.nativeElement).click();
      await vi.advanceTimersByTimeAsync(999);
      expect(api.getEngine).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(api.getEngine).toHaveBeenCalledTimes(2);
      await fixture.whenStable();
      expect(errorTexts(fixture.nativeElement)).toEqual(['boom']);
    });

    it('stops polling once paused', async () => {
      vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
      const fixture = await setup();
      playPause(fixture.nativeElement).click();
      api.toggleEngine.mockReturnValue(of(engineState({ running: false })));
      playPause(fixture.nativeElement).click();
      await vi.advanceTimersByTimeAsync(5000);
      expect(api.getEngine).toHaveBeenCalledTimes(1);
    });

    it('starts polling when the engine is already running on load', async () => {
      vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
      api.getEngine.mockReturnValue(of(engineState({ running: true })));
      await setup();
      await vi.advanceTimersByTimeAsync(1000);
      expect(api.getEngine).toHaveBeenCalledTimes(2);
    });

    it('the button reads Play while paused and Pause while running', async () => {
      const fixture = await setup();
      const el = fixture.nativeElement as HTMLElement;
      expect(buttonNamed(el, 'Play')).toBeDefined();
      expect(buttonNamed(el, 'Pause')).toBeUndefined();

      buttonNamed(el, 'Play')!.click();
      await fixture.whenStable();
      expect(buttonNamed(el, 'Pause')).toBeDefined();
      expect(buttonNamed(el, 'Play')).toBeUndefined();

      api.toggleEngine.mockReturnValue(of(engineState({ running: false })));
      buttonNamed(el, 'Pause')!.click();
      await fixture.whenStable();
      expect(buttonNamed(el, 'Play')).toBeDefined();
    });

    it('reads Pause on load when the engine is already running', async () => {
      api.getEngine.mockReturnValue(of(engineState({ running: true })));
      const fixture = await setup();
      expect(buttonNamed(fixture.nativeElement, 'Pause')).toBeDefined();
    });

    it('after a Step, the grid gets the new tick and reloads its robots', async () => {
      const fixture = await setup();
      const grid = fixture.debugElement.query(By.directive(Grid)).componentInstance as Grid;
      buttonNamed(fixture.nativeElement, 'Step')!.click();
      await fixture.whenStable();
      expect(grid.tick()).toBe(1);
      expect(api.getRobots).toHaveBeenCalledTimes(2);
    });

    it('after a Step, the selected robot’s queue is reloaded', async () => {
      const fixture = await setup();
      const el = fixture.nativeElement as HTMLElement;
      robotEl(el, 7).click();
      await fixture.whenStable();
      expect(queueItems(el)).toEqual(['MOVE', 'LEFT']);

      api.getQueuedCommands.mockReturnValue(of([queues[7][1]]));
      buttonNamed(el, 'Step')!.click();
      await fixture.whenStable();
      expect(api.getQueuedCommands).toHaveBeenLastCalledWith(7);
      expect(queueItems(el)).toEqual(['LEFT']);
    });

    it('a polled tick change reloads the queue; the same tick does not', async () => {
      vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
      const fixture = await setup();
      const el = fixture.nativeElement as HTMLElement;
      robotEl(el, 7).click();
      await fixture.whenStable();
      expect(api.getQueuedCommands).toHaveBeenCalledTimes(1);

      api.toggleEngine.mockReturnValue(of(engineState({ running: true })));
      api.getEngine.mockReturnValue(of(engineState({ running: true, currentTick: 1 })));
      playPause(el).click();
      await vi.advanceTimersByTimeAsync(1000);
      expect(api.getQueuedCommands).toHaveBeenCalledTimes(2);
      await vi.advanceTimersByTimeAsync(1000);
      expect(api.getQueuedCommands).toHaveBeenCalledTimes(2);
    });

    it('no robot selected → a tick loads no queue', async () => {
      const fixture = await setup();
      buttonNamed(fixture.nativeElement, 'Step')!.click();
      await fixture.whenStable();
      expect(api.getQueuedCommands).not.toHaveBeenCalled();
    });

    describe('Reset All', () => {
      let confirmSpy: ReturnType<typeof vi.fn<(message?: string) => boolean>>;

      beforeEach(() => {
        confirmSpy = vi.fn<(message?: string) => boolean>(() => true);
        vi.stubGlobal('confirm', confirmSpy);
        // The reset floor is 10 x 8 with no robots, as the API returns.
        api.resetFloor.mockImplementation(() => {
          api.getRobots.mockReturnValue(of([]));
          api.getCells.mockReturnValue(of(makeCells(10, 8)));
          return of({ id: 1, width: 10, height: 8 });
        });
      });

      afterEach(() => vi.unstubAllGlobals());

      it('sits right after Log in the top bar', async () => {
        const fixture = await setup();
        const labels = Array.from(
          (fixture.nativeElement as HTMLElement).querySelectorAll('.area-top button'),
        ).map((b) => b.textContent!.trim());
        expect(labels.indexOf('Reset All')).toBe(labels.indexOf('Log') + 1);
      });

      it('asks "Reset the entire floor?"', async () => {
        const fixture = await setup();
        buttonNamed(fixture.nativeElement, 'Reset All')!.click();
        expect(confirmSpy).toHaveBeenCalledExactlyOnceWith('Reset the entire floor?');
      });

      it('No → no request; robots and selection unchanged', async () => {
        confirmSpy.mockReturnValue(false);
        const fixture = await setup();
        const el = fixture.nativeElement as HTMLElement;
        robotEl(el, 7).click();
        await fixture.whenStable();
        buttonNamed(el, 'Reset All')!.click();
        await fixture.whenStable();
        expect(api.resetFloor).not.toHaveBeenCalled();
        expect(robotEl(el, 7)).toBeDefined();
        expect(buttonNamed(el, 'Move')!.disabled).toBe(false);
        expect(queueItems(el)).toEqual(['MOVE', 'LEFT']);
      });

      it('Yes → resetFloor(1); 10 x 8 floor, robots gone, selection and queue clear; engine state re-read', async () => {
        const fixture = await setup();
        const el = fixture.nativeElement as HTMLElement;
        robotEl(el, 7).click();
        await fixture.whenStable();
        buttonNamed(el, 'Reset All')!.click();
        await fixture.whenStable();
        expect(api.resetFloor).toHaveBeenCalledExactlyOnceWith(1);
        expect(el.querySelectorAll('app-cell')).toHaveLength(80);
        expect(el.querySelectorAll('app-robot')).toHaveLength(0);
        expect(queueItems(el)).toEqual([]);
        for (const label of ['Move', 'Turn Left', 'Turn Right', 'Delete']) {
          expect(buttonNamed(el, label)!.disabled).toBe(true);
        }
        expect(api.getEngine).toHaveBeenCalledTimes(2);
      });

      it('while running, Yes → Play label, Step enabled, polling stops', async () => {
        vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
        api.getEngine.mockReturnValue(of(engineState({ running: true, currentTick: 3 })));
        const fixture = await setup();
        const el = fixture.nativeElement as HTMLElement;
        expect(buttonNamed(el, 'Pause')).toBeDefined();

        api.getEngine.mockReturnValue(of(engineState()));
        buttonNamed(el, 'Reset All')!.click();
        await fixture.whenStable();
        expect(buttonNamed(el, 'Play')).toBeDefined();
        expect(buttonNamed(el, 'Step')!.disabled).toBe(false);
        const calls = api.getEngine.mock.calls.length;
        await vi.advanceTimersByTimeAsync(5000);
        expect(api.getEngine).toHaveBeenCalledTimes(calls);
      });

      it('while running, No → still Pause; nothing sent; polling continues', async () => {
        vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
        confirmSpy.mockReturnValue(false);
        api.getEngine.mockReturnValue(of(engineState({ running: true })));
        const fixture = await setup();
        const el = fixture.nativeElement as HTMLElement;
        buttonNamed(el, 'Reset All')!.click();
        await fixture.whenStable();
        expect(buttonNamed(el, 'Pause')).toBeDefined();
        expect(api.resetFloor).not.toHaveBeenCalled();
        expect(api.toggleEngine).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(1000);
        expect(api.getEngine).toHaveBeenCalledTimes(2);
      });

      it('reset fails → "Floor failed to reset." shows; grid unchanged', async () => {
        api.resetFloor.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 0 })));
        const fixture = await setup();
        const el = fixture.nativeElement as HTMLElement;
        buttonNamed(el, 'Reset All')!.click();
        await fixture.whenStable();
        expect(errorTexts(el)).toEqual(['Floor failed to reset.']);
        expect(robotEl(el, 7)).toBeDefined();
        expect(el.querySelectorAll('app-cell')).toHaveLength(25);
      });

      it('reset fails while running → engine state re-read; the label follows it', async () => {
        api.getEngine.mockReturnValue(of(engineState({ running: true })));
        api.resetFloor.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 500 })));
        const fixture = await setup();
        const el = fixture.nativeElement as HTMLElement;
        api.getEngine.mockReturnValue(of(engineState()));
        buttonNamed(el, 'Reset All')!.click();
        await fixture.whenStable();
        expect(api.getEngine).toHaveBeenCalledTimes(2);
        expect(buttonNamed(el, 'Play')).toBeDefined();
      });
    });
  });

  describe('timeline', () => {
    let confirmSpy: ReturnType<typeof vi.fn<(message?: string) => boolean>>;
    const pastState: FloorState = {
      width: 5,
      height: 5,
      cells: makeCells(5, 5).map((c) => ({ x: c.xPosition, y: c.yPosition, obstacle: false })),
      robots: [
        { id: 7, displayId: 7, x: 0, y: 0, direction: Direction.North, queue: ['RIGHT', 'MOVE'] },
      ],
    };

    beforeEach(() => {
      confirmSpy = vi.fn<(message?: string) => boolean>(() => true);
      vi.stubGlobal('confirm', confirmSpy);
      api.getFloors.mockReturnValue(
        of([
          { id: 1, width: 5, height: 5 },
          { id: 2, width: 5, height: 5 },
        ]),
      );
      api.getEngine.mockReturnValue(of(engineState({ currentTick: 5 })));
      api.getFloorState.mockReturnValue(of(pastState));
    });

    afterEach(() => {
      vi.unstubAllGlobals();
      vi.useRealTimers();
    });

    const range = (el: HTMLElement) =>
      el.querySelector<HTMLInputElement>('app-timeline input[aria-label="Tick"]')!;
    const select = (el: HTMLElement) =>
      el.querySelector<HTMLSelectElement>('app-timeline select[aria-label="Floor"]')!;
    function errorTexts(el: HTMLElement): string[] {
      return Array.from(el.querySelectorAll('.area-errors li')).map((li) =>
        li.textContent!.replace('×', '').trim(),
      );
    }

    async function scrub(fixture: ComponentFixture<App>, tick: number) {
      const input = range(fixture.nativeElement);
      input.value = String(tick);
      input.dispatchEvent(new Event('input'));
      await fixture.whenStable();
    }

    it('the Shift+Click hint hides while a past tick is shown', async () => {
      const fixture = await setup();
      const el = fixture.nativeElement as HTMLElement;
      robotEl(el, 7).click();
      await fixture.whenStable();
      expect(el.textContent).toContain('Shift + Click an empty cell to issue a GOTO command');
      await scrub(fixture, 2);
      expect(el.textContent).not.toContain('Shift + Click an empty cell to issue a GOTO command');
    });

    async function chooseFloor(fixture: ComponentFixture<App>, id: number) {
      select(fixture.nativeElement).value = String(id);
      select(fixture.nativeElement).dispatchEvent(new Event('change'));
      await fixture.whenStable();
    }

    it('timeline renders below the grid and above the errors', async () => {
      const fixture = await setup();
      const el = fixture.nativeElement as HTMLElement;
      const timeline = el.querySelector('app-timeline')!;
      expect(timeline.classList).toContain('area-timeline');
      const grid = el.querySelector('.floor')!;
      const errors = el.querySelector('.area-errors ul')!;
      expect(
        grid.compareDocumentPosition(timeline) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      expect(
        timeline.compareDocumentPosition(errors) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      expect(range(el).max).toBe('5');
    });

    it('Delete Floor sits right after Reset All', async () => {
      const fixture = await setup();
      const labels = Array.from(
        (fixture.nativeElement as HTMLElement).querySelectorAll('.area-top button'),
      ).map((b) => b.textContent?.trim());
      expect(labels.indexOf('Delete Floor')).toBe(labels.indexOf('Reset All') + 1);
    });

    it('read-only disables Step, Play, Edit, Turn Left, Turn Right, Move, Delete, Reset All, Delete Floor; arrow keys send nothing', async () => {
      const fixture = await setup();
      const el = fixture.nativeElement as HTMLElement;
      await scrub(fixture, 2);
      expect(api.getFloorState).toHaveBeenLastCalledWith(1, 2);
      robotEl(el, 7).click();
      await fixture.whenStable();
      for (const label of [
        'Step',
        'Play',
        'Edit: Off',
        'Turn Left',
        'Turn Right',
        'Move',
        'Delete',
        'Reset All',
        'Delete Floor',
      ]) {
        expect({ label, disabled: buttonNamed(el, label)!.disabled }).toEqual({
          label,
          disabled: true,
        });
      }
      for (const key of ['ArrowLeft', 'ArrowRight', 'ArrowUp']) {
        document.dispatchEvent(new KeyboardEvent('keydown', { key }));
      }
      expect(api.queueCommand).not.toHaveBeenCalled();
    });

    it('read-only while running: Pause stays enabled', async () => {
      vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
      api.getEngine.mockReturnValue(of(engineState({ currentTick: 5, running: true })));
      const fixture = await setup();
      await scrub(fixture, 2);
      expect(buttonNamed(fixture.nativeElement, 'Pause')!.disabled).toBe(false);
      expect(buttonNamed(fixture.nativeElement, 'Step')!.disabled).toBe(true);
    });

    it('read-only keeps the scrubber, Fork, dropdown, Log and robot selection enabled', async () => {
      const fixture = await setup();
      const el = fixture.nativeElement as HTMLElement;
      await scrub(fixture, 2);
      expect(range(el).disabled).toBe(false);
      expect(el.querySelector<HTMLInputElement>('input[aria-label="Tick number"]')!.disabled).toBe(
        false,
      );
      expect(select(el).disabled).toBe(false);
      expect(buttonNamed(el, 'Fork From Here')!.disabled).toBe(false);
      expect(buttonNamed(el, 'Log')!.disabled).toBe(false);
      robotEl(el, 7).click();
      await fixture.whenStable();
      expect(el.querySelector('app-queue-panel h2')!.textContent).toContain('R7');
    });

    it('scrubbing while running: a new currentTick from polling keeps the pinned viewTick', async () => {
      vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
      api.getEngine.mockReturnValue(of(engineState({ currentTick: 5, running: true })));
      const fixture = await setup();
      const el = fixture.nativeElement as HTMLElement;
      await scrub(fixture, 2);
      api.getEngine.mockReturnValue(of(engineState({ currentTick: 6, running: true })));
      await vi.advanceTimersByTimeAsync(1000);
      await fixture.whenStable();
      expect(range(el).max).toBe('6');
      expect(range(el).value).toBe('2');
      expect(api.getFloorState).toHaveBeenCalledTimes(1);
      await scrub(fixture, 6);
      expect(buttonNamed(el, 'Pause')!.disabled).toBe(false);
      expect(buttonNamed(el, 'Reset All')!.disabled).toBe(false);
    });

    it("Fork sends the scrubber's tick, then shows the new floor live", async () => {
      api.forkFloor.mockReturnValue(of(2));
      const fixture = await setup();
      const el = fixture.nativeElement as HTMLElement;
      await scrub(fixture, 3);
      robotEl(el, 7).click();
      await fixture.whenStable();
      api.getEngine.mockReturnValue(of(engineState({ floorId: 2, currentTick: 3 })));
      api.getCells.mockClear();
      buttonNamed(el, 'Fork From Here')!.click();
      await fixture.whenStable();
      expect(api.forkFloor).toHaveBeenCalledExactlyOnceWith(1, 3);
      expect(api.getCells).toHaveBeenLastCalledWith(2);
      expect(select(el).value).toBe('2');
      expect(range(el).value).toBe('3');
      expect(buttonNamed(el, 'Reset All')!.disabled).toBe(false);
      expect(buttonNamed(el, 'Move')!.disabled).toBe(true);
    });

    it('Fork failure shows Floor failed to fork.', async () => {
      api.forkFloor.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 400 })));
      const fixture = await setup();
      buttonNamed(fixture.nativeElement, 'Fork From Here')!.click();
      await fixture.whenStable();
      expect(errorTexts(fixture.nativeElement)).toEqual(['Floor failed to fork.']);
    });

    it('dropdown change calls selectFloor, shows Play, and clears the selection', async () => {
      vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
      api.getEngine.mockReturnValue(of(engineState({ currentTick: 5, running: true })));
      api.selectFloor.mockReturnValue(of(engineState({ floorId: 2, currentTick: 0 })));
      const fixture = await setup();
      const el = fixture.nativeElement as HTMLElement;
      robotEl(el, 7).click();
      await fixture.whenStable();
      await chooseFloor(fixture, 2);
      expect(api.selectFloor).toHaveBeenCalledExactlyOnceWith(2);
      expect(buttonNamed(el, 'Play')).toBeDefined();
      expect(buttonNamed(el, 'Move')!.disabled).toBe(true);
      expect(queueItems(el)).toEqual([]);
      expect(api.getCells).toHaveBeenLastCalledWith(2);
    });

    it('choosing another floor while viewing a past tick shows that floor live', async () => {
      api.selectFloor.mockReturnValue(of(engineState({ floorId: 2, currentTick: 0 })));
      const fixture = await setup();
      const el = fixture.nativeElement as HTMLElement;
      await scrub(fixture, 2);
      api.getCells.mockClear();
      await chooseFloor(fixture, 2);
      expect(api.getCells).toHaveBeenLastCalledWith(2);
      expect(api.getFloorState).toHaveBeenCalledTimes(1);
      expect(buttonNamed(el, 'Reset All')!.disabled).toBe(false);
      expect(select(el).value).toBe('2');
    });

    it('Delete Floor: No → nothing sent', async () => {
      confirmSpy.mockReturnValue(false);
      const fixture = await setup();
      buttonNamed(fixture.nativeElement, 'Delete Floor')!.click();
      await fixture.whenStable();
      expect(confirmSpy).toHaveBeenCalledExactlyOnceWith('Delete this floor?');
      expect(api.deleteFloor).not.toHaveBeenCalled();
    });

    it('Delete Floor: Yes → deleteFloor, floors refresh, selection clears', async () => {
      api.deleteFloor.mockImplementation(() => {
        api.getFloors.mockReturnValue(of([{ id: 2, width: 5, height: 5 }]));
        return of(engineState({ floorId: 2, currentTick: 0 }));
      });
      const fixture = await setup();
      const el = fixture.nativeElement as HTMLElement;
      robotEl(el, 7).click();
      await fixture.whenStable();
      buttonNamed(el, 'Delete Floor')!.click();
      await fixture.whenStable();
      expect(api.deleteFloor).toHaveBeenCalledExactlyOnceWith(1);
      expect(Array.from(select(el).options).map((o) => o.textContent?.trim())).toEqual(['Floor 2']);
      expect(buttonNamed(el, 'Move')!.disabled).toBe(true);
      expect(api.getCells).toHaveBeenLastCalledWith(2);
    });

    it('Delete Floor failure → Floor failed to delete.', async () => {
      api.deleteFloor.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 0 })));
      const fixture = await setup();
      buttonNamed(fixture.nativeElement, 'Delete Floor')!.click();
      await fixture.whenStable();
      expect(errorTexts(fixture.nativeElement)).toEqual(['Floor failed to delete.']);
    });

    it('Reset All resets only the viewed floor id', async () => {
      api.selectFloor.mockReturnValue(of(engineState({ floorId: 2, currentTick: 0 })));
      const fixture = await setup();
      await chooseFloor(fixture, 2);
      buttonNamed(fixture.nativeElement, 'Reset All')!.click();
      await fixture.whenStable();
      expect(api.resetFloor).toHaveBeenCalledExactlyOnceWith(2);
    });

    it('the selected robot keeps its selection and history queue when the replayed state uses another id', async () => {
      api.getFloorState.mockReturnValue(
        of({
          ...pastState,
          robots: [
            // Live R7 is robot 7; the replay calls it 3. R9 exists only in the past.
            { id: 3, displayId: 7, x: 0, y: 0, direction: Direction.North, queue: ['RIGHT'] },
            { id: 7, displayId: 9, x: 1, y: 0, direction: Direction.North, queue: ['MOVE'] },
          ],
        }),
      );
      const fixture = await setup();
      const el = fixture.nativeElement as HTMLElement;
      robotEl(el, 7).click();
      await fixture.whenStable();
      await scrub(fixture, 2);
      expect(el.querySelector('app-queue-panel h2')!.textContent).toContain('R7');
      expect(queueItems(el)).toEqual(['RIGHT']);
      expect(robotEl(el, 7).querySelector('.robot')!.classList).toContain('border-green-300');
      expect(robotEl(el, 9).querySelector('.robot')!.classList).not.toContain('border-green-300');
    });

    it('a robot that exists only in the past is deselected when going back to live', async () => {
      api.getFloorState.mockReturnValue(
        of({
          ...pastState,
          robots: [
            { id: 7, displayId: 9, x: 1, y: 0, direction: Direction.North, queue: ['MOVE'] },
          ],
        }),
      );
      const fixture = await setup();
      const el = fixture.nativeElement as HTMLElement;
      await scrub(fixture, 2);
      robotEl(el, 9).click();
      await fixture.whenStable();
      expect(queueItems(el)).toEqual(['MOVE']);
      api.getQueuedCommands.mockClear();
      await scrub(fixture, 5);
      expect(api.getQueuedCommands).not.toHaveBeenCalled();
      expect(queueItems(el)).toEqual([]);
      expect(el.querySelector('app-queue-panel h2')?.textContent ?? '').not.toContain('R');
      expect(buttonNamed(el, 'Move')!.disabled).toBe(true);
    });

    it("history view shows the selected robot's queue at that tick", async () => {
      const fixture = await setup();
      const el = fixture.nativeElement as HTMLElement;
      robotEl(el, 7).click();
      await fixture.whenStable();
      expect(queueItems(el)).toEqual(['MOVE', 'LEFT']);
      await scrub(fixture, 2);
      expect(queueItems(el)).toEqual(['RIGHT', 'MOVE']);
      await scrub(fixture, 5);
      expect(queueItems(el)).toEqual(['MOVE', 'LEFT']);
    });
  });
});
