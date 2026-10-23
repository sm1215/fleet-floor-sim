import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { Observable, of, throwError } from 'rxjs';
import { stubDialog } from '../../../testing/dialog-stub';
import { LogEntry } from '../../models/log-entry.model';
import { SimulationApiService } from '../../services/simulation-api.service';
import { LogModal } from './log-modal';

describe('LogModal', () => {
  beforeAll(stubDialog);

  const entries: LogEntry[] = [
    { id: 1, action: 'PLACE', params: 'R1 2, 3, NORTH', result: 'OK' },
    { id: 2, action: 'TICK', params: '1', result: 'R1 2,4,NORTH\nR2 0,0,EAST' },
  ];
  let api: {
    getLogEntries: ReturnType<typeof vi.fn<(floorId: number) => Observable<LogEntry[]>>>;
  };

  beforeEach(() => {
    api = { getLogEntries: vi.fn(() => of(entries)) };
    TestBed.configureTestingModule({
      providers: [{ provide: SimulationApiService, useValue: api }],
    });
  });

  async function setup() {
    const fixture = TestBed.createComponent(LogModal);
    fixture.componentRef.setInput('floorId', 3);
    await fixture.whenStable();
    const closed = vi.fn();
    fixture.componentInstance.closed.subscribe(closed);
    const dialog = (fixture.nativeElement as HTMLElement).querySelector('dialog')!;
    const close = dialog.querySelector<HTMLButtonElement>('button[aria-label="Close"]')!;
    return { dialog, close, closed };
  }

  it('opens as a native modal dialog', async () => {
    const { dialog } = await setup();
    expect(dialog.open).toBe(true);
  });

  it('fetches the log once on create', async () => {
    await setup();
    expect(api.getLogEntries).toHaveBeenCalledTimes(1);
  });

  it('requests the log for the given floorId', async () => {
    await setup();
    expect(api.getLogEntries).toHaveBeenCalledWith(3);
  });

  it('renders one line per entry, in order, as "action params: result"', async () => {
    const { dialog } = await setup();
    const items = Array.from(dialog.querySelectorAll('li'));
    expect(items.map((li) => li.textContent!.trim())).toEqual([
      'PLACE R1 2, 3, NORTH: OK',
      'TICK 1: R1 2,4,NORTH\nR2 0,0,EAST',
    ]);
    for (const li of items) expect(li.classList).toContain('whitespace-pre-line');
  });

  it('a fetch error renders no entries and keeps the dialog open', async () => {
    api.getLogEntries.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 0 })));
    const { dialog } = await setup();
    expect(dialog.querySelectorAll('li')).toHaveLength(0);
    expect(dialog.open).toBe(true);
  });

  it('the close button shows X, has a pointer cursor and the app-button styles', async () => {
    const { close } = await setup();
    expect(close.textContent!.trim()).toBe('X');
    for (const cls of [
      'cursor-pointer',
      'rounded',
      'border-2',
      'border-[#1971c2]',
      'bg-[#a5d8ff]',
      'text-[#1971c2]',
      'hover:brightness-95',
    ]) {
      expect(close.classList).toContain(cls);
    }
  });

  it('emits closed when X is clicked', async () => {
    const { close, closed } = await setup();
    close.click();
    expect(closed).toHaveBeenCalledTimes(1);
  });

  it('emits closed on Escape (dialog cancel)', async () => {
    const { dialog, closed } = await setup();
    dialog.dispatchEvent(new Event('cancel', { cancelable: true }));
    expect(closed).toHaveBeenCalledTimes(1);
  });
});
