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
    service.getRobots().subscribe((robots) => (result = robots));
    const req = http.expectOne(`${api}/robots`);
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
    service.getLogEntries().subscribe((e) => (result = e));
    const req = http.expectOne(`${api}/log-entries`);
    expect(req.request.method).toBe('GET');
    req.flush(entries);
    expect(result).toEqual(entries);
  });
});
