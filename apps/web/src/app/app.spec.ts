import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { of, throwError } from 'rxjs';
import { stubDialog } from '../testing/dialog-stub';
import { App } from './app';
import { Grid } from './components/grid/grid';
import { Cell } from './models/cell.model';
import { SimulationApiService } from './services/simulation-api.service';

function makeCells(width: number, height: number): Cell[] {
  const cells: Cell[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      cells.push({ id: cells.length + 1, obstacle: false, xPosition: x, yPosition: y, floorId: 1 });
    }
  }
  return cells;
}

describe('App', () => {
  beforeAll(stubDialog);

  let api: Record<
    'getFloors' | 'createFloor' | 'updateFloor' | 'getCells',
    ReturnType<typeof vi.fn>
  >;

  beforeEach(() => {
    api = {
      getFloors: vi.fn(() => of([{ id: 1, width: 5, height: 5 }])),
      createFloor: vi.fn(),
      updateFloor: vi.fn(),
      getCells: vi.fn(() => of(makeCells(5, 5))),
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
  });
});
