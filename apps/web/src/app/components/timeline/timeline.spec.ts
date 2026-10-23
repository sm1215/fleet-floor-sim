import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Floor } from '../../models/floor.model';
import { Timeline } from './timeline';

describe('Timeline', () => {
  let fixture: ComponentFixture<Timeline>;
  let component: Timeline;
  let el: HTMLElement;

  const floors: Floor[] = [
    { id: 1, width: 5, height: 5 },
    { id: 4, width: 3, height: 3 },
  ];

  async function render(currentTick: number, floorId: number | null = 1) {
    fixture = TestBed.createComponent(Timeline);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('currentTick', currentTick);
    fixture.componentRef.setInput('floors', floors);
    fixture.componentRef.setInput('floorId', floorId);
    await fixture.whenStable();
    el = fixture.nativeElement as HTMLElement;
  }

  const range = () => el.querySelector<HTMLInputElement>('input[aria-label="Tick"]')!;
  const number = () => el.querySelector<HTMLInputElement>('input[aria-label="Tick number"]')!;
  const select = () => el.querySelector<HTMLSelectElement>('select[aria-label="Floor"]')!;
  const forkButton = () =>
    Array.from(el.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Fork From Here',
    )!;

  async function setTick(tick: number) {
    fixture.componentRef.setInput('currentTick', tick);
    await fixture.whenStable();
  }

  async function slide(value: number) {
    range().value = String(value);
    range().dispatchEvent(new Event('input'));
    await fixture.whenStable();
  }

  async function typeNumber(value: string, event: 'input' | 'change') {
    number().value = value;
    number().dispatchEvent(new Event(event));
    await fixture.whenStable();
  }

  it('range has min 0 and max equal to currentTick, and follows currentTick while viewTick is null', async () => {
    await render(3);
    expect(range().min).toBe('0');
    expect(range().max).toBe('3');
    expect(range().step).toBe('1');
    expect(range().value).toBe('3');
    await setTick(4);
    expect(range().max).toBe('4');
    expect(range().value).toBe('4');
    expect(component.viewTick()).toBeNull();
  });

  it('pinned: after moving to 2, a currentTick change keeps the value at 2', async () => {
    await render(5);
    await slide(2);
    expect(component.viewTick()).toBe(2);
    await setTick(6);
    expect(range().value).toBe('2');
    expect(range().max).toBe('6');
    expect(component.viewTick()).toBe(2);
  });

  it('moving back to max sets viewTick to null, and it follows again', async () => {
    await render(5);
    await slide(2);
    await slide(5);
    expect(component.viewTick()).toBeNull();
    await setTick(7);
    expect(range().value).toBe('7');
  });

  it('range input updates the number input and the number input updates the range', async () => {
    await render(10);
    await slide(4);
    expect(number().value).toBe('4');
    await typeNumber('6', 'input');
    expect(range().value).toBe('6');
    expect(component.viewTick()).toBe(6);
  });

  it('number change: 7.8 → 7; 99 (currentTick 10) → 10 and live; -3 → 0; empty → shows the scrubber value, viewTick unchanged', async () => {
    await render(10);
    await typeNumber('7.8', 'change');
    expect(component.viewTick()).toBe(7);
    expect(number().value).toBe('7');
    await typeNumber('99', 'change');
    expect(component.viewTick()).toBeNull();
    expect(number().value).toBe('10');
    await typeNumber('-3', 'change');
    expect(component.viewTick()).toBe(0);
    expect(number().value).toBe('0');
    await typeNumber('', 'change');
    expect(component.viewTick()).toBe(0);
    expect(number().value).toBe('0');
  });

  it('number input: a fractional or out-of-range value is not applied until change', async () => {
    await render(10);
    await typeNumber('7.5', 'input');
    expect(component.viewTick()).toBeNull();
    await typeNumber('11', 'input');
    expect(component.viewTick()).toBeNull();
  });

  it('while the number input has focus, a new currentTick does not overwrite what is typed; blur shows the tick again', async () => {
    await render(10);
    number().dispatchEvent(new Event('focus'));
    await typeNumber('', 'input');
    await setTick(11);
    expect(number().value).toBe('');
    expect(range().value).toBe('11');
    number().dispatchEvent(new Event('blur'));
    await fixture.whenStable();
    expect(number().value).toBe('11');
  });

  it('Fork From Here emits viewTick, or currentTick when live', async () => {
    await render(8);
    const forked: number[] = [];
    component.forked.subscribe((t) => forked.push(t));
    forkButton().click();
    await slide(3);
    forkButton().click();
    expect(forked).toEqual([8, 3]);
  });

  it('dropdown lists "Floor <id>" per floor, selects floorId, and emits floorSelected on change', async () => {
    await render(0, 4);
    const options = Array.from(select().options);
    expect(options.map((o) => o.textContent?.trim())).toEqual(['Floor 1', 'Floor 4']);
    expect(select().value).toBe('4');
    const selected: number[] = [];
    component.floorSelected.subscribe((id) => selected.push(id));
    select().value = '1';
    select().dispatchEvent(new Event('change'));
    expect(selected).toEqual([1]);
  });
});
