import { TestBed } from '@angular/core/testing';
import { Button } from './button';

describe('Button', () => {
  async function setup(disabled: boolean) {
    const fixture = TestBed.createComponent(Button);
    fixture.componentRef.setInput('label', 'Step');
    fixture.componentRef.setInput('disabled', disabled);
    await fixture.whenStable();
    const pressed = vi.fn();
    fixture.componentInstance.pressed.subscribe(pressed);
    const button = (fixture.nativeElement as HTMLElement).querySelector('button')!;
    return { button, pressed };
  }

  it('renders the label', async () => {
    const { button } = await setup(false);
    expect(button.textContent?.trim()).toBe('Step');
  });

  it('emits pressed on click', async () => {
    const { button, pressed } = await setup(false);
    button.click();
    expect(pressed).toHaveBeenCalledTimes(1);
  });

  it('does not emit pressed when disabled', async () => {
    const { button, pressed } = await setup(true);
    button.click();
    expect(pressed).not.toHaveBeenCalled();
  });

  it('uses the normal border, or the orange border when highlighted', async () => {
    const fixture = TestBed.createComponent(Button);
    fixture.componentRef.setInput('label', 'Edit');
    await fixture.whenStable();
    const button = (fixture.nativeElement as HTMLElement).querySelector('button')!;
    expect(button.classList).toContain('border-[#1971c2]');
    expect(button.classList).not.toContain('border-[#f08c00]');

    fixture.componentRef.setInput('highlighted', true);
    await fixture.whenStable();
    expect(button.classList).toContain('border-[#f08c00]');
    expect(button.classList).not.toContain('border-[#1971c2]');
  });
});
