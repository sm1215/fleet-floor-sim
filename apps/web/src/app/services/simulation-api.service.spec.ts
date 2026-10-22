import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../environments/environment';
import { Cell } from '../models/cell.model';
import { Direction } from '../models/direction';
import { QueuedCommand } from '../models/queued-command.model';
import { Robot } from '../models/robot.model';
import { SimulationApiService } from './simulation-api.service';

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

  it('createFloor → POST /floors with the size', () => {
    service.createFloor({ width: 5, height: 5 }).subscribe();
    const req = http.expectOne(`${api}/floors`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ width: 5, height: 5 });
    req.flush({ id: 1, width: 5, height: 5 });
  });

  it('updateFloor → PATCH /floors/:id with the size', () => {
    service.updateFloor(3, { width: 7, height: 2 }).subscribe();
    const req = http.expectOne(`${api}/floors/3`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ width: 7, height: 2 });
    req.flush({ id: 3, width: 7, height: 2 });
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

  it('updateCell → PATCH /cells/:id with the change; maps floor.id to floorId', () => {
    let result: Cell | undefined;
    service.updateCell(4, { obstacle: true }).subscribe((cell) => (result = cell));
    const req = http.expectOne(`${api}/cells/4`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ obstacle: true });
    req.flush({
      id: 4,
      obstacle: true,
      xPosition: 1,
      yPosition: 2,
      floor: { id: 1, width: 5, height: 5 },
    });
    expect(result).toEqual({ id: 4, obstacle: true, xPosition: 1, yPosition: 2, floorId: 1 });
  });

  it('getRobots → GET /robots; maps the cell to cellId, x and y', () => {
    let result: Robot[] = [];
    service.getRobots().subscribe((robots) => (result = robots));
    const req = http.expectOne(`${api}/robots`);
    expect(req.request.method).toBe('GET');
    req.flush([
      { id: 12, direction: 1, cell: { id: 7, obstacle: false, xPosition: 2, yPosition: 3 } },
    ]);
    expect(result).toEqual([{ id: 12, direction: Direction.East, cellId: 7, x: 2, y: 3 }]);
  });

  it('createRobot → POST /robots with cellId and North; maps the result', () => {
    let result: Robot | undefined;
    service.createRobot(7).subscribe((robot) => (result = robot));
    const req = http.expectOne(`${api}/robots`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ cellId: 7, direction: Direction.North });
    req.flush({
      id: 13,
      direction: 0,
      cell: { id: 7, obstacle: false, xPosition: 2, yPosition: 3 },
    });
    expect(result).toEqual({ id: 13, direction: Direction.North, cellId: 7, x: 2, y: 3 });
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

  it('createQueuedCommand → POST /queued-commands with robotId and command', () => {
    let result: QueuedCommand | undefined;
    service.createQueuedCommand(5, 'RIGHT').subscribe((command) => (result = command));
    const req = http.expectOne(`${api}/queued-commands`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ robotId: 5, command: 'RIGHT' });
    req.flush({ id: 3, command: 'RIGHT', params: null, robot: { id: 5 } });
    expect(result).toEqual({ id: 3, command: 'RIGHT', params: null, robotId: 5 });
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
});
