import { TestBed } from '@angular/core/testing';
import { stubDialog } from '../testing/dialog-stub';
import { App } from './app';

describe('App', () => {
  beforeAll(stubDialog);

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
});
