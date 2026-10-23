import { HttpErrorResponse } from '@angular/common/http';
import {
  Component,
  computed,
  DestroyRef,
  inject,
  input,
  OnInit,
  output,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import {
  catchError,
  EMPTY,
  map,
  Observable,
  of,
  skip,
  Subject,
  switchMap,
  takeUntil,
  tap,
} from 'rxjs';
import { Cell as CellModel } from '../../models/cell.model';
import { Direction } from '../../models/direction';
import { Floor, FloorSize } from '../../models/floor.model';
import { Robot } from '../../models/robot.model';
import { SimulationApiService } from '../../services/simulation-api.service';
import { Cell } from '../cell/cell';

const MAX_FLOOR_WIDTH = 500;
const MAX_FLOOR_HEIGHT = 400;
const DEFAULT_SIZE = 5;

export const RESIZE_ERROR = "Can't resize grid, not enough space for existing robots";
export const SERVER_ERROR = "Server can't be reached";
export const PLACE_ERROR = 'Robot failed to place.';

interface LoadedFloor {
  floor: Floor;
  cells: CellModel[];
  robots: Robot[];
}

@Component({
  selector: 'app-grid',
  imports: [Cell],
  templateUrl: './grid.html',
  /** contents: the slider row and floor are placed directly in App's layout grid. */
  host: { class: 'contents' },
})
export class Grid implements OnInit {
  private readonly api = inject(SimulationApiService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly sizeChanges = new Subject<FloorSize>();
  /** Fires on resetFloor(); a resize still in flight is dropped. */
  private readonly resets = new Subject<void>();

  readonly editMode = input(false);
  readonly selectedRobotId = input<number | null>(null);
  /** The engine's current tick; each change reloads the robots. */
  readonly tick = input(0);
  readonly gridError = output<string>();
  readonly robotClicked = output<number>();

  /** The last saved floor whose cells are shown. */
  protected readonly floor = signal<Floor | null>(null);
  protected readonly cells = signal<CellModel[]>([]);
  protected readonly robots = signal<Robot[]>([]);
  /** Slider values; differ from floor() only while a change is unsaved. */
  protected readonly width = signal(DEFAULT_SIZE);
  protected readonly height = signal(DEFAULT_SIZE);

  /** Square cell size in px, so the floor fits within MAX_FLOOR_WIDTH x MAX_FLOOR_HEIGHT. */
  protected readonly cellSize = computed(() => {
    const floor = this.floor();
    if (!floor) return 0;
    return Math.floor(Math.min(MAX_FLOOR_WIDTH / floor.width, MAX_FLOOR_HEIGHT / floor.height));
  });

  /** Cells in render order: top row (y = height - 1) first, down to y = 0; x left to right. */
  protected readonly orderedCells = computed(() =>
    [...this.cells()].sort((a, b) => b.yPosition - a.yPosition || a.xPosition - b.xPosition),
  );

  /** Row labels in render order: height - 1 at the top, down to 0. */
  protected readonly rowLabels = computed(() => {
    const height = this.floor()?.height ?? 0;
    return Array.from({ length: height }, (_, i) => height - 1 - i);
  });

  /** Column labels left to right: 0 to width - 1. */
  protected readonly columnLabels = computed(() =>
    Array.from({ length: this.floor()?.width ?? 0 }, (_, i) => i),
  );

  private readonly tickChanges = toObservable(this.tick);

  protected readonly robotsByCell = computed(
    () => new Map(this.robots().map((robot) => [robot.cellId, robot])),
  );

  ngOnInit(): void {
    this.api
      .getFloors()
      .pipe(
        switchMap((floors) =>
          floors.length > 0
            ? of(floors[0])
            : this.api
                .floorCommand({ width: DEFAULT_SIZE, height: DEFAULT_SIZE })
                .pipe(switchMap(() => this.currentFloor())),
        ),
        switchMap((floor) => this.withCells(floor)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (loaded) => this.show(loaded),
        error: () => this.gridError.emit(SERVER_ERROR),
      });

    // switchMap: a newer release cancels the earlier request, so a late
    // response can never overwrite newer values.
    this.sizeChanges
      .pipe(
        switchMap((size) =>
          this.api.floorCommand(size).pipe(
            switchMap(() => this.currentFloor()),
            switchMap((floor) => this.withCells(floor)),
            catchError((err: unknown) => {
              this.syncSliders();
              // The Engine ignores a resize with no room for the robots (400).
              const noRoom = err instanceof HttpErrorResponse && err.status === 400;
              this.gridError.emit(noRoom ? RESIZE_ERROR : SERVER_ERROR);
              return EMPTY;
            }),
            takeUntil(this.resets),
          ),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((loaded) => this.show(loaded));

    this.reloadRobotsOnTick();
  }

  /** A tick can turn and move robots: reload them (skips the initial value). */
  private reloadRobotsOnTick(): void {
    this.tickChanges
      .pipe(
        skip(1),
        switchMap(() =>
          this.api.getRobots().pipe(
            catchError(() => {
              this.gridError.emit(SERVER_ERROR);
              return EMPTY;
            }),
          ),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((robots) => this.robots.set(robots));
  }

  protected onSizeChange(): void {
    if (!this.floor()) return;
    this.sizeChanges.next({ width: this.width(), height: this.height() });
  }

  /**
   * Edit mode on: toggles Open/Obstacle, unless a robot is on the cell.
   * Edit mode off: moves the selected robot to an empty Open cell, or places
   * a new robot facing North when none is selected.
   */
  protected onCellClick(cell: CellModel): void {
    if (this.robotsByCell().has(cell.id)) return;
    if (this.editMode()) {
      this.api
        .obstacleCommand(cell.xPosition, cell.yPosition)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: () =>
            this.cells.update((cells) =>
              cells.map((c) => (c.id === cell.id ? { ...c, obstacle: !c.obstacle } : c)),
            ),
          // The cell stays as it was.
          error: () => undefined,
        });
    } else if (!cell.obstacle) {
      const id = this.selectedRobotId();
      const selected = id === null ? undefined : this.findRobot(id);
      const place = selected
        ? this.api.placeCommand(
            cell.xPosition,
            cell.yPosition,
            selected.direction,
            selected.displayId,
          )
        : this.api.placeCommand(cell.xPosition, cell.yPosition, Direction.North);
      place
        .pipe(
          switchMap(() => this.api.getRobots()),
          takeUntilDestroyed(this.destroyRef),
        )
        .subscribe({
          next: (robots) => this.robots.set(robots),
          error: () => this.gridError.emit(PLACE_ERROR),
        });
    }
  }

  /** Resets the floor on the API, then shows it. Errors are left to the caller. */
  resetFloor(): Observable<void> {
    const floor = this.floor();
    if (!floor) return EMPTY;
    this.resets.next();
    return this.api.resetFloor(floor.id).pipe(
      switchMap((reset) => this.withCells(reset)),
      tap((loaded) => this.show(loaded)),
      map(() => undefined),
    );
  }

  /** The shown robot with this Id; commands address it by its displayId. */
  findRobot(id: number): Robot | undefined {
    return this.robots().find((robot) => robot.id === id);
  }

  /** Drops a deleted robot from the grid. */
  removeRobot(id: number): void {
    this.robots.update((robots) => robots.filter((robot) => robot.id !== id));
  }

  /** The single floor, as saved after a FLOOR command. */
  private currentFloor(): Observable<Floor> {
    return this.api.getFloors().pipe(map((floors) => floors[0]));
  }

  /** Loads cells, then robots: a resize can move robots to other cells. */
  private withCells(floor: Floor): Observable<LoadedFloor> {
    return this.api
      .getCells(floor.id)
      .pipe(
        switchMap((cells) =>
          this.api.getRobots().pipe(map((robots) => ({ floor, cells, robots }))),
        ),
      );
  }

  /** Shows a floor, its cells and robots together, so the grid never lays out stale cells. */
  private show({ floor, cells, robots }: LoadedFloor): void {
    this.floor.set(floor);
    this.cells.set(cells);
    this.robots.set(robots);
    this.syncSliders();
  }

  private syncSliders(): void {
    const floor = this.floor();
    if (!floor) return;
    this.width.set(floor.width);
    this.height.set(floor.height);
  }
}
