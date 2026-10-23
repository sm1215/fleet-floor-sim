import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { Cell } from '../models/cell.model';
import { Direction } from '../models/direction';
import { LogEntry } from '../models/log-entry.model';
import { EngineState } from '../models/engine-state.model';
import { FloorState } from '../models/floor-state.model';
import { Floor, FloorSize } from '../models/floor.model';
import { CommandName, QueuedCommand } from '../models/queued-command.model';
import { Robot } from '../models/robot.model';

/** Cell as returned by the API: the floor relation instead of floorId. */
interface ApiCell extends Omit<Cell, 'floorId'> {
  floor: Floor;
}

/** Robot as returned by the API: the cell relation instead of cellId, x and y. */
interface ApiRobot {
  id: number;
  displayId: number;
  direction: Direction;
  cell: Omit<Cell, 'floorId'>;
}

/** Queued command as returned by the API: the robot relation instead of robotId. */
interface ApiQueuedCommand extends Omit<QueuedCommand, 'robotId'> {
  robot: { id: number };
}

function toCell({ floor, ...cell }: ApiCell): Cell {
  return { ...cell, floorId: floor.id };
}

function toRobot({ id, displayId, direction, cell }: ApiRobot): Robot {
  return { id, displayId, direction, cellId: cell.id, x: cell.xPosition, y: cell.yPosition };
}

/** Uppercase names the command routes take; the index is the `Direction` value. */
const DIRECTION_NAMES = ['NORTH', 'EAST', 'SOUTH', 'WEST'] as const;

const rId = (displayId: number) => `R${displayId}`;

function toQueuedCommand({ robot, ...command }: ApiQueuedCommand): QueuedCommand {
  return { ...command, robotId: robot.id };
}

/** A past floor state in the shapes the grid and queue panel render. */
export interface LoadedState {
  floor: Floor;
  cells: Cell[];
  robots: Robot[];
  /** Each robot's queue by robot id, FIFO. */
  queues: Map<number, QueuedCommand[]>;
}

/**
 * Maps a `FloorState` for display only (timeline.md). Cell ids are
 * `y * width + x + 1`; queue entries get ids 1..n in order.
 *
 * A replayed state's robot ids need not match the live ones (replay numbers
 * new robots itself; a fork's past carries the source floor's ids), so each
 * robot takes the live id of the robot with its displayId (`liveIds`:
 * displayId → id). A robot that is no longer live gets `-displayId`.
 */
export function toLoadedState(
  floorId: number,
  state: FloorState,
  liveIds = new Map<number, number>(),
): LoadedState {
  const cellId = (x: number, y: number) => y * state.width + x + 1;
  const idOf = (displayId: number) => liveIds.get(displayId) ?? -displayId;
  return {
    floor: { id: floorId, width: state.width, height: state.height },
    cells: state.cells.map(({ x, y, obstacle }) => ({
      id: cellId(x, y),
      obstacle,
      xPosition: x,
      yPosition: y,
      floorId,
    })),
    robots: state.robots.map(({ displayId, direction, x, y }) => ({
      id: idOf(displayId),
      displayId,
      direction,
      cellId: cellId(x, y),
      x,
      y,
    })),
    queues: new Map(
      state.robots.map((r) => {
        const id = idOf(r.displayId);
        return [
          id,
          r.queue.map((item, i) => {
            const [command, params = null] = item.split(' ');
            return { id: i + 1, command: command as QueuedCommand['command'], params, robotId: id };
          }),
        ];
      }),
    ),
  };
}

/** HTTP client for the simulation API. */
@Injectable({ providedIn: 'root' })
export class SimulationApiService {
  private readonly http = inject(HttpClient);
  private readonly api = environment.apiUrl;

  getFloors(): Observable<Floor[]> {
    return this.http.get<Floor[]>(`${this.api}/floors`);
  }

  /** Empties the floor and its log, rebuilds it 5 x 5 all Open, and pauses the engine at tick 0. */
  resetFloor(id: number): Observable<Floor> {
    return this.http.post<Floor>(`${this.api}/floors/${id}/reset`, {});
  }

  /** All cells of one floor. */
  getCells(floorId: number): Observable<Cell[]> {
    return this.http
      .get<ApiCell[]>(`${this.api}/cells`)
      .pipe(map((cells) => cells.filter((cell) => cell.floor.id === floorId).map(toCell)));
  }

  /** One floor's robots. */
  getRobots(floorId: number): Observable<Robot[]> {
    return this.http
      .get<ApiRobot[]>(`${this.api}/robots`, { params: { floorId } })
      .pipe(map((robots) => robots.map(toRobot)));
  }

  /** One robot's queue in FIFO order. */
  getQueuedCommands(robotId: number): Observable<QueuedCommand[]> {
    return this.http
      .get<ApiQueuedCommand[]>(`${this.api}/robots/${robotId}/queued-commands`)
      .pipe(map((commands) => commands.map(toQueuedCommand)));
  }

  /** Creates the floor, or resizes it. 400 when the resize has no room. */
  floorCommand(size: FloorSize): Observable<void> {
    return this.command('floor', size);
  }

  /** Toggles the cell at x/y between Open and Obstacle. */
  obstacleCommand(x: number, y: number): Observable<void> {
    return this.command('obstacle', { x, y });
  }

  /** Moves and turns robot `displayId`, or places a new robot when it is omitted. */
  placeCommand(x: number, y: number, direction: Direction, displayId?: number): Observable<void> {
    const body = { x, y, direction: DIRECTION_NAMES[direction] };
    return this.command('place', displayId === undefined ? body : { ...body, rId: rId(displayId) });
  }

  queueCommand(displayId: number, command: CommandName): Observable<void> {
    return this.command('queue', { rId: rId(displayId), commands: [command] });
  }

  /** Enqueues a GOTO x,y for robot `displayId` (pathfinding.md). */
  gotoCommand(displayId: number, x: number, y: number): Observable<void> {
    return this.command('goto', { rId: rId(displayId), x, y });
  }

  /** Deletes a robot and its queued commands. */
  deleteCommand(displayId: number): Observable<void> {
    return this.command('delete', { rId: rId(displayId) });
  }

  /** One floor's log entries, ascending id. */
  getLogEntries(floorId: number): Observable<LogEntry[]> {
    return this.http.get<LogEntry[]>(`${this.api}/log-entries`, { params: { floorId } });
  }

  /** Makes the floor active; the engine pauses. */
  selectFloor(floorId: number): Observable<EngineState> {
    return this.http.post<EngineState>(`${this.api}/engine/floor`, { floorId });
  }

  /** The floor at a past (or the current) tick. */
  getFloorState(floorId: number, tick: number): Observable<FloorState> {
    return this.http.get<FloorState>(`${this.api}/floors/${floorId}/history`, {
      params: { tick },
    });
  }

  /** Fork From Here: a new floor matching this one up to `tick`; emits its id. */
  forkFloor(floorId: number, tick: number): Observable<number> {
    return this.http
      .post<{ floorId: number }>(`${this.api}/floors/${floorId}/fork`, { tick })
      .pipe(map((res) => res.floorId));
  }

  /** Deletes the floor and everything on it; the engine pauses. */
  deleteFloor(floorId: number): Observable<EngineState> {
    return this.http.post<EngineState>(`${this.api}/floors/${floorId}/delete`, {});
  }

  getEngine(): Observable<EngineState> {
    return this.http.get<EngineState>(`${this.api}/engine`);
  }

  stepEngine(): Observable<EngineState> {
    return this.http.post<EngineState>(`${this.api}/engine/step`, {});
  }

  /** Turns the engine's automatic stepping on or off. */
  toggleEngine(): Observable<EngineState> {
    return this.http.post<EngineState>(`${this.api}/engine/toggle`, {});
  }

  /** POST /commands/<name>; the `{ ok: true }` body is dropped. */
  private command(name: string, body: object): Observable<void> {
    return this.http.post(`${this.api}/commands/${name}`, body).pipe(map(() => undefined));
  }
}
