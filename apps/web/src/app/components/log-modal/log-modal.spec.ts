import { TestBed } from '@angular/core/testing';
import { stubDialog } from '../../../testing/dialog-stub';
import { LogModal } from './log-modal';

describe('LogModal', () => {
  beforeAll(stubDialog);

  async function setup() {
    const fixture = TestBed.createComponent(LogModal);
    await fixture.whenStable();
    const closed = vi.fn();
    fixture.componentInstance.closed.subscribe(closed);
    const dialog = (fixture.nativeElement as HTMLElement).querySelector('dialog')!;
    return { dialog, closed };
  }

  it('opens as a native modal dialog', async () => {
    const { dialog } = await setup();
    expect(dialog.open).toBe(true);
  });

  it('emits closed when X is clicked', async () => {
    const { dialog, closed } = await setup();
    dialog.querySelector<HTMLButtonElement>('button[aria-label="Close"]')!.click();
    expect(closed).toHaveBeenCalledTimes(1);
  });

  it('emits closed on Escape (dialog cancel)', async () => {
    const { dialog, closed } = await setup();
    dialog.dispatchEvent(new Event('cancel', { cancelable: true }));
    expect(closed).toHaveBeenCalledTimes(1);
  });
});
