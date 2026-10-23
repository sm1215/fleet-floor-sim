import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../environments/environment';
import { Cell } from '../models/cell.model';
import { Direction } from '../models/direction';
import { EngineState } from '../models/engine-state.model';
import { FloorState } from '../models/floor-state.model';
import { QueuedCommand } from '../models/queued-command.model';
import { Robot } from '../models/robot.model';
import { SimulationApiService, toLoadedState } from './simulation-api.service';

describe('SimulationApiService', () => {
  const api = environment.apiUrl;
  let service: SimulationApiService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(SimulationApiService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('getFloors → GET /floors', () => {
    service.getFloors().subscribe();
    const req = http.expectOne(`${api}/floors`);
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('resetFloor → POST /floors/:id/reset', () => {
    service.resetFloor(1).subscribe();
    const req = http.expectOne(`${api}/floors/1/reset`);
    expect(req.request.method).toBe('POST');
    req.flush({ id: 1, width: 5, height: 5 });
  });

  it('getCells → GET /cells, keeps the floor’s cells and maps floor.id to floorId', () => {
    let result: Cell[] = [];
    service.getCells(2).subscribe((cells) => (result = cells));
    const req = http.expectOne(`${api}/cells`);
    expect(req.request.method).toBe('GET');
    req.flush([
      {
        id: 10,
        obstacle: false,
        xPosition: 0,
        yPosition: 0,
        floor: { id: 1, width: 1, height: 1 },
      },
      { id: 11, obstacle: true, xPosition: 1, yPosition: 0, floor: { id: 2, width: 2, height: 1 } },
    ]);
    expect(result).toEqual([{ id: 11, obstacle: true, xPosition: 1, yPosition: 0, floorId: 2 }]);
  });

  it('getRobots → GET /robots; maps displayId and the cell to cellId, x and y', () => {
    let result: Robot[] = [];
    service.getRobots(1).subscribe((robots) => (result = robots));
    const req = http.expectOne(`${api}/robots?floorId=1`);
    expect(req.request.method).toBe('GET');
    req.flush([
      {
        id: 12,
        displayId: 4,
        direction: 1,
        cell: { id: 7, obstacle: false, xPosition: 2, yPosition: 3 },
      },
    ]);
    expect(result).toEqual([
      { id: 12, displayId: 4, direction: Direction.East, cellId: 7, x: 2, y: 3 },
    ]);
  });

  it('getQueuedCommands → GET /robots/:id/queued-commands; maps robot.id to robotId', () => {
    let result: QueuedCommand[] = [];
    service.getQueuedCommands(5).subscribe((commands) => (result = commands));
    const req = http.expectOne(`${api}/robots/5/queued-commands`);
    expect(req.request.method).toBe('GET');
    req.flush([
      { id: 1, command: 'MOVE', params: null, robot: { id: 5, direction: 0 } },
      { id: 2, command: 'LEFT', params: null, robot: { id: 5, direction: 0 } },
    ]);
    expect(result).toEqual([
      { id: 1, command: 'MOVE', params: null, robotId: 5 },
      { id: 2, command: 'LEFT', params: null, robotId: 5 },
    ]);
  });

  const state = { currentTick: 1, tickRate: 1000, running: false, errors: [] };

  it('getEngine → GET /engine', () => {
    service.getEngine().subscribe();
    const req = http.expectOne(`${api}/engine`);
    expect(req.request.method).toBe('GET');
    req.flush(state);
  });

  it('stepEngine → POST /engine/step', () => {
    service.stepEngine().subscribe();
    const req = http.expectOne(`${api}/engine/step`);
    expect(req.request.method).toBe('POST');
    req.flush(state);
  });

  it('toggleEngine → POST /engine/toggle', () => {
    service.toggleEngine().subscribe();
    const req = http.expectOne(`${api}/engine/toggle`);
    expect(req.request.method).toBe('POST');
    req.flush({ ...state, running: true });
  });

  describe('commands', () => {
    function expectCommand(route: string, body: unknown) {
      const req = http.expectOne(`${api}/commands/${route}`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual(body);
      req.flush({ ok: true });
    }

    it('floorCommand → POST /commands/floor with the size', () => {
      service.floorCommand({ width: 8, height: 3 }).subscribe();
      expectCommand('floor', { width: 8, height: 3 });
    });

    it('obstacleCommand → POST /commands/obstacle with x and y', () => {
      service.obstacleCommand(2, 3).subscribe();
      expectCommand('obstacle', { x: 2, y: 3 });
    });

    it('placeCommand without displayId → POST /commands/place with no rId', () => {
      service.placeCommand(2, 3, Direction.North).subscribe();
      expectCommand('place', { x: 2, y: 3, direction: 'NORTH' });
    });

    it('placeCommand with displayId → rId R<displayId> and the direction name', () => {
      service.placeCommand(0, 1, Direction.West, 4).subscribe();
      expectCommand('place', { x: 0, y: 1, direction: 'WEST', rId: 'R4' });
    });

    it('queueCommand → POST /commands/queue with rId and one command', () => {
      service.queueCommand(3, 'LEFT').subscribe();
      expectCommand('queue', { rId: 'R3', commands: ['LEFT'] });
    });

    it('deleteCommand → POST /commands/delete with rId', () => {
      service.deleteCommand(7).subscribe();
      expectCommand('delete', { rId: 'R7' });
    });

    it('a command emits once with no value', () => {
      const next = vi.fn();
      service.deleteCommand(7).subscribe(next);
      http.expectOne(`${api}/commands/delete`).flush({ ok: true });
      expect(next).toHaveBeenCalledExactlyOnceWith(undefined);
    });
  });

  it('getLogEntries → GET /log-entries', () => {
    const entries = [{ id: 1, action: 'TICK', params: '1', result: 'EMPTY' }];
    let result: unknown;
    service.getLogEntries(1).subscribe((e) => (result = e));
    const req = http.expectOne(`${api}/log-entries?floorId=1`);
    expect(req.request.method).toBe('GET');
    req.flush(entries);
    expect(result).toEqual(entries);
  });
  it('getRobots(floorId) → GET /robots?floorId=', () => {
    service.getRobots(3).subscribe();
    const req = http.expectOne(`${api}/robots?floorId=3`);
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('getLogEntries(floorId) → GET /log-entries?floorId=', () => {
    service.getLogEntries(3).subscribe();
    const req = http.expectOne(`${api}/log-entries?floorId=3`);
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('selectFloor → POST /engine/floor { floorId }', () => {
    let state: EngineState | undefined;
    service.selectFloor(2).subscribe((s) => (state = s));
    const req = http.expectOne(`${api}/engine/floor`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ floorId: 2 });
    const body = { floorId: 2, currentTick: 4, tickRate: 1000, running: false, errors: [] };
    req.flush(body);
    expect(state).toEqual(body);
  });

  it('getFloorState → GET /floors/:id/history?tick=', () => {
    service.getFloorState(2, 5).subscribe();
    const req = http.expectOne(`${api}/floors/2/history?tick=5`);
    expect(req.request.method).toBe('GET');
    req.flush({ width: 1, height: 1, cells: [], robots: [] });
  });

  it('forkFloor → POST /floors/:id/fork { tick }, maps to the new floorId', () => {
    let id: number | undefined;
    service.forkFloor(2, 7).subscribe((v) => (id = v));
    const req = http.expectOne(`${api}/floors/2/fork`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ tick: 7 });
    req.flush({ floorId: 9 });
    expect(id).toBe(9);
  });

  it('deleteFloor → POST /floors/:id/delete', () => {
    service.deleteFloor(2).subscribe();
    const req = http.expectOne(`${api}/floors/2/delete`);
    expect(req.request.method).toBe('POST');
    req.flush({ floorId: 1, currentTick: 0, tickRate: 1000, running: false, errors: [] });
  });

  it('toLoadedState maps x/y to matching cell and robot cellIds and keeps queue order', () => {
    const state: FloorState = {
      width: 3,
      height: 2,
      cells: [
        { x: 0, y: 0, obstacle: false },
        { x: 1, y: 0, obstacle: true },
        { x: 2, y: 0, obstacle: false },
        { x: 0, y: 1, obstacle: false },
        { x: 1, y: 1, obstacle: false },
        { x: 2, y: 1, obstacle: false },
      ],
      robots: [
        { id: 40, displayId: 2, x: 2, y: 1, direction: Direction.West, queue: ['MOVE', 'LEFT'] },
      ],
    };
    // Live R2 is robot 40.
    const loaded = toLoadedState(7, state, new Map([[2, 40]]));
    expect(loaded.floor).toEqual({ id: 7, width: 3, height: 2 });
    expect(loaded.cells[1]).toEqual({
      id: 2,
      obstacle: true,
      xPosition: 1,
      yPosition: 0,
      floorId: 7,
    });
    const cellAt = (id: number) => loaded.cells.find((c) => c.id === id)!;
    const [robot] = loaded.robots;
    expect(robot).toEqual({
      id: 40,
      displayId: 2,
      direction: Direction.West,
      cellId: 6,
      x: 2,
      y: 1,
    });
    expect(cellAt(robot.cellId)).toMatchObject({ xPosition: 2, yPosition: 1 });
    expect(loaded.queues.get(40)).toEqual([
      { id: 1, command: 'MOVE', params: null, robotId: 40 },
      { id: 2, command: 'LEFT', params: null, robotId: 40 },
    ]);
  });

  it("toLoadedState gives each robot the live id of the robot with its displayId, not the state's id", () => {
    const state: FloorState = {
      width: 2,
      height: 1,
      cells: [
        { x: 0, y: 0, obstacle: false },
        { x: 1, y: 0, obstacle: false },
      ],
      robots: [
        // Replay ids: 3 and 4. Live: R5 is robot 4; R6 was deleted since.
        { id: 3, displayId: 5, x: 0, y: 0, direction: Direction.North, queue: ['MOVE'] },
        { id: 4, displayId: 6, x: 1, y: 0, direction: Direction.North, queue: ['LEFT'] },
      ],
    };
    const loaded = toLoadedState(1, state, new Map([[5, 4]]));
    expect(loaded.robots.map((r) => [r.displayId, r.id])).toEqual([
      [5, 4],
      [6, -6],
    ]);
    expect(loaded.queues.get(4)!.map((q) => q.command)).toEqual(['MOVE']);
    expect(loaded.queues.get(-6)!.map((q) => q.command)).toEqual(['LEFT']);
  });
});
