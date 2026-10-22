import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { of, Subject, throwError } from 'rxjs';
import { stubDialog } from '../testing/dialog-stub';
import { App } from './app';
import { Grid } from './components/grid/grid';
import { Cell } from './models/cell.model';
import { Direction } from './models/direction';
import { EngineState } from './models/engine-state.model';
import { CommandName, QueuedCommand } from './models/queued-command.model';
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
  return { currentTick: 0, tickRate: 1000, running: false, errors: [], ...change };
}

describe('App', () => {
  beforeAll(stubDialog);

  let api: Record<
    | 'getFloors'
    | 'createFloor'
    | 'updateFloor'
    | 'getCells'
    | 'updateCell'
    | 'getRobots'
    | 'createRobot'
    | 'getQueuedCommands'
    | 'createQueuedCommand'
    | 'getEngine'
    | 'stepEngine'
    | 'toggleEngine',
    ReturnType<typeof vi.fn>
  >;

  beforeEach(() => {
    api = {
      getFloors: vi.fn(() => of([{ id: 1, width: 5, height: 5 }])),
      createFloor: vi.fn(),
      updateFloor: vi.fn(),
      getCells: vi.fn(() => of(makeCells(5, 5))),
      updateCell: vi.fn(),
      getRobots: vi.fn(() =>
        of([
          { id: 7, direction: Direction.North, cellId: 1, x: 0, y: 0 },
          { id: 8, direction: Direction.East, cellId: 2, x: 1, y: 0 },
        ]),
      ),
      createRobot: vi.fn(),
      getQueuedCommands: vi.fn((robotId: number) => of(queues[robotId] ?? [])),
      createQueuedCommand: vi.fn((robotId: number, command: CommandName) =>
        of({ id: 100, command, params: null, robotId }),
      ),
      getEngine: vi.fn(() => of(engineState())),
      stepEngine: vi.fn(() => of(engineState({ currentTick: 1 }))),
      toggleEngine: vi.fn(() => of(engineState({ running: true }))),
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

  it('renders the default 5 x 5 floor', async () => {
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

    it('a 409 resize shows the exact text', async () => {
      api.updateFloor.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 409 })));
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
      api.createQueuedCommand.mockReturnValue(
        throwError(() => new HttpErrorResponse({ status: 500 })),
      );
      const fixture = await setup();
      const el = fixture.nativeElement as HTMLElement;
      robotEl(el, 7).click();
      await fixture.whenStable();
      buttonNamed(el, 'Move')!.click();
      await fixture.whenStable();
      expect(queueItems(el)).toEqual(['MOVE', 'LEFT']);
      expect(errorTexts(el)).toEqual(['Command failed to queue.']);
    });

    it('a failed placement shows "Robot failed to place."', async () => {
      api.getRobots.mockReturnValue(of([]));
      api.createRobot.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 400 })));
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

    it('passes edit mode to the grid: a cell click PATCHes instead of placing', async () => {
      api.updateCell.mockReturnValue(
        of({ id: 21, obstacle: true, xPosition: 0, yPosition: 4, floorId: 1 }),
      );
      const fixture = await setup();
      const el = fixture.nativeElement as HTMLElement;
      editButton(el).click();
      await fixture.whenStable();
      el.querySelector<HTMLElement>('app-cell .cell')!.click();
      await fixture.whenStable();
      expect(api.updateCell).toHaveBeenCalledExactlyOnceWith(21, { obstacle: true });
      expect(api.createRobot).not.toHaveBeenCalled();
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

    it('no selection → Move / Turn Left / Turn Right disabled; arrow keys send nothing', async () => {
      const { el } = await selected();
      for (const label of ['Move', 'Turn Left', 'Turn Right']) {
        expect(buttonNamed(el, label)!.disabled).toBe(true);
      }
      for (const key of ['ArrowLeft', 'ArrowRight', 'ArrowUp']) {
        document.dispatchEvent(new KeyboardEvent('keydown', { key }));
      }
      expect(api.createQueuedCommand).not.toHaveBeenCalled();
    });

    it('a selection enables the command buttons', async () => {
      const { el } = await selected(7);
      for (const label of ['Move', 'Turn Left', 'Turn Right']) {
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

    it('selects in edit mode too, with no PATCH /cells', async () => {
      const fixture = await setup();
      const el = fixture.nativeElement as HTMLElement;
      buttonNamed(el, 'Edit: Off')!.click();
      await fixture.whenStable();
      robotEl(el, 7).click();
      await fixture.whenStable();
      expect(isSelected(el, 7)).toBe(true);
      expect(api.updateCell).not.toHaveBeenCalled();
    });

    it.each([
      ['Turn Left', 'LEFT'],
      ['Turn Right', 'RIGHT'],
      ['Move', 'MOVE'],
    ])('the %s button POSTs %s with the selected robot Id', async (label, command) => {
      const { fixture, el } = await selected(8);
      buttonNamed(el, label)!.click();
      await fixture.whenStable();
      expect(api.createQueuedCommand).toHaveBeenCalledExactlyOnceWith(8, command);
    });

    it.each([
      ['ArrowLeft', 'LEFT'],
      ['ArrowRight', 'RIGHT'],
      ['ArrowUp', 'MOVE'],
    ])('%s POSTs %s with the selected robot Id', async (key, command) => {
      const { fixture } = await selected(7);
      document.dispatchEvent(new KeyboardEvent('keydown', { key }));
      await fixture.whenStable();
      expect(api.createQueuedCommand).toHaveBeenCalledExactlyOnceWith(7, command);
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

    it('POST success → the returned command is appended to the panel', async () => {
      const { fixture, el } = await selected(7);
      buttonNamed(el, 'Turn Right')!.click();
      await fixture.whenStable();
      expect(queueItems(el)).toEqual(['MOVE', 'LEFT', 'RIGHT']);
    });

    it('a POST that succeeds after switching robots does not reach the new panel', async () => {
      const pending = new Subject<QueuedCommand>();
      api.createQueuedCommand.mockReturnValueOnce(pending);
      const { fixture, el } = await selected(7);
      buttonNamed(el, 'Move')!.click();
      robotEl(el, 8).click();
      await fixture.whenStable();
      pending.next({ id: 101, command: 'MOVE', params: null, robotId: 7 });
      pending.complete();
      await fixture.whenStable();
      expect(queueItems(el)).toEqual(['RIGHT']);
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

      buttonNamed(fixture.nativeElement, 'Play / Pause')!.click();
      await fixture.whenStable();
      expect(step().disabled).toBe(true);
      step().click();
      expect(api.stepEngine).not.toHaveBeenCalled();

      api.toggleEngine.mockReturnValue(of(engineState({ running: false })));
      buttonNamed(fixture.nativeElement, 'Play / Pause')!.click();
      await fixture.whenStable();
      expect(step().disabled).toBe(false);
    });

    it('Play / Pause → POST /engine/toggle', async () => {
      const fixture = await setup();
      buttonNamed(fixture.nativeElement, 'Play / Pause')!.click();
      expect(api.toggleEngine).toHaveBeenCalledTimes(1);
    });

    it('while running, polls GET /engine every tickRate ms and shows its errors', async () => {
      vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
      const fixture = await setup();
      api.getEngine.mockReturnValue(of(engineState({ running: true, errors: ['boom'] })));
      buttonNamed(fixture.nativeElement, 'Play / Pause')!.click();
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
      buttonNamed(fixture.nativeElement, 'Play / Pause')!.click();
      api.toggleEngine.mockReturnValue(of(engineState({ running: false })));
      buttonNamed(fixture.nativeElement, 'Play / Pause')!.click();
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
  });
});
