import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../environments/environment';
import { Cell } from '../models/cell.model';
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
});
