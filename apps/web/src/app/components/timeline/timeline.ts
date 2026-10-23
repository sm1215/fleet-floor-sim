import { Component, computed, input, model, output, signal } from '@angular/core';
import { Floor } from '../../models/floor.model';
import { Button } from '../button/button';

/**
 * Scrubber, tick number, Fork From Here and floor dropdown (timeline.md).
 * `viewTick` is null while live: the scrubber then follows `currentTick`.
 */
@Component({
  selector: 'app-timeline',
  imports: [Button],
  templateUrl: './timeline.html',
  host: { class: 'flex items-center gap-3 text-sm' },
})
export class Timeline {
  readonly currentTick = input.required<number>();
  readonly floors = input<Floor[]>([]);
  readonly floorId = input<number | null>(null);
  /** The past tick being viewed; null = live. */
  readonly viewTick = model<number | null>(null);
  /** The tick to fork from. */
  readonly forked = output<number>();
  readonly floorSelected = output<number>();

  protected readonly shown = computed(() => this.viewTick() ?? this.currentTick());
  /** The number input's value at focus; held while typing so a new tick doesn't overwrite it. */
  private readonly held = signal<number | null>(null);
  protected readonly numberValue = computed(() => this.held() ?? this.shown());

  protected onRangeInput(event: Event): void {
    this.apply((event.target as HTMLInputElement).valueAsNumber);
  }

  /** Applies a whole number within range at once; anything else waits for `change`. */
  protected onNumberInput(event: Event): void {
    const value = (event.target as HTMLInputElement).valueAsNumber;
    if (Number.isInteger(value) && value >= 0 && value <= this.currentTick()) {
      this.apply(value);
    }
  }

  protected onNumberFocus(): void {
    this.held.set(this.shown());
  }

  protected onNumberBlur(event: Event): void {
    this.held.set(null);
    (event.target as HTMLInputElement).value = String(this.shown());
  }

  /** Floors and clamps; empty / NaN keeps the scrubber value. */
  protected onNumberChange(event: Event): void {
    const field = event.target as HTMLInputElement;
    this.held.set(null);
    const value = field.valueAsNumber;
    if (!Number.isNaN(value)) {
      this.apply(Math.min(Math.max(Math.floor(value), 0), this.currentTick()));
    }
    field.value = String(this.shown());
  }

  protected onFork(): void {
    this.forked.emit(this.shown());
  }

  protected onFloorChange(event: Event): void {
    this.floorSelected.emit(Number((event.target as HTMLSelectElement).value));
  }

  private apply(tick: number): void {
    this.viewTick.set(tick >= this.currentTick() ? null : tick);
  }
}
