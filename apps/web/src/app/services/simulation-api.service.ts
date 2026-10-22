import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { Cell } from '../models/cell.model';
import { Direction } from '../models/direction';
import { EngineState } from '../models/engine-state.model';
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

function toRobot({ id, direction, cell }: ApiRobot): Robot {
  return { id, direction, cellId: cell.id, x: cell.xPosition, y: cell.yPosition };
}

function toQueuedCommand({ robot, ...command }: ApiQueuedCommand): QueuedCommand {
  return { ...command, robotId: robot.id };
}

/** HTTP client for the simulation API. */
@Injectable({ providedIn: 'root' })
export class SimulationApiService {
  private readonly http = inject(HttpClient);
  private readonly api = environment.apiUrl;

  getFloors(): Observable<Floor[]> {
    return this.http.get<Floor[]>(`${this.api}/floors`);
  }

  createFloor(size: FloorSize): Observable<Floor> {
    return this.http.post<Floor>(`${this.api}/floors`, size);
  }

  updateFloor(id: number, size: FloorSize): Observable<Floor> {
    return this.http.patch<Floor>(`${this.api}/floors/${id}`, size);
  }

  /** Empties the floor and the log, rebuilds it 5 x 5 all Open, and pauses the engine at tick 0. */
  resetFloor(id: number): Observable<Floor> {
    return this.http.post<Floor>(`${this.api}/floors/${id}/reset`, {});
  }

  /** All cells of one floor. */
  getCells(floorId: number): Observable<Cell[]> {
    return this.http
      .get<ApiCell[]>(`${this.api}/cells`)
      .pipe(map((cells) => cells.filter((cell) => cell.floor.id === floorId).map(toCell)));
  }

  updateCell(id: number, change: Pick<Cell, 'obstacle'>): Observable<Cell> {
    return this.http.patch<ApiCell>(`${this.api}/cells/${id}`, change).pipe(map(toCell));
  }

  getRobots(): Observable<Robot[]> {
    return this.http
      .get<ApiRobot[]>(`${this.api}/robots`)
      .pipe(map((robots) => robots.map(toRobot)));
  }

  /** Places a new robot, facing North, on a cell. */
  createRobot(cellId: number): Observable<Robot> {
    return this.http
      .post<ApiRobot>(`${this.api}/robots`, { cellId, direction: Direction.North })
      .pipe(map(toRobot));
  }

  /** Deletes a robot; the API deletes its queued commands with it. */
  deleteRobot(id: number): Observable<void> {
    return this.http.delete<void>(`${this.api}/robots/${id}`);
  }

  /** One robot's queue in FIFO order. */
  getQueuedCommands(robotId: number): Observable<QueuedCommand[]> {
    return this.http
      .get<ApiQueuedCommand[]>(`${this.api}/robots/${robotId}/queued-commands`)
      .pipe(map((commands) => commands.map(toQueuedCommand)));
  }

  createQueuedCommand(robotId: number, command: CommandName): Observable<QueuedCommand> {
    return this.http
      .post<ApiQueuedCommand>(`${this.api}/queued-commands`, { robotId, command })
      .pipe(map(toQueuedCommand));
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
}
