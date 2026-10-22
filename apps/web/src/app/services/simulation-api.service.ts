import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { Cell } from '../models/cell.model';
import { Floor, FloorSize } from '../models/floor.model';

/** Cell as returned by the API: the floor relation instead of floorId. */
interface ApiCell extends Omit<Cell, 'floorId'> {
  floor: Floor;
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

  /** All cells of one floor. */
  getCells(floorId: number): Observable<Cell[]> {
    return this.http
      .get<ApiCell[]>(`${this.api}/cells`)
      .pipe(
        map((cells) =>
          cells
            .filter((cell) => cell.floor.id === floorId)
            .map(({ floor, ...cell }) => ({ ...cell, floorId: floor.id })),
        ),
      );
  }
}
