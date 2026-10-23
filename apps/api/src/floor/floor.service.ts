import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { Floor } from '../../database/entities/index.js';
import { EngineService } from '../engine/engine.service.js';
import { WriteLock } from '../shared/write-lock.js';
import { deleteFloorContents, insertOpenCells } from './floor-writes.js';
import { DEFAULT_FLOOR_SIZE } from './floor.model.js';

/** Reads and Reset. Create and resize go through POST /commands/floor. */
@Injectable()
export class FloorService {
  constructor(
    @InjectRepository(Floor) private readonly repo: Repository<Floor>,
    private readonly dataSource: DataSource,
    private readonly engine: EngineService,
    private readonly lock: WriteLock,
  ) {}

  /**
   * Pauses the engine and sets this floor's tick to 0, then empties the floor
   * (queued commands, robots, cells, log entries, snapshots) and rebuilds it
   * as an all-Open DEFAULT_FLOOR_SIZE square. The floor keeps its id; other
   * floors are untouched.
   */
  async reset(id: number): Promise<Floor> {
    await this.findOne(id);
    // Taken after engine.reset(): that waits for an in-flight tick, which needs the lock.
    await this.engine.reset(id);
    await this.write(async (manager) => {
      await deleteFloorContents(manager, id);
      const floor = await manager.getRepository(Floor).save({
        id,
        width: DEFAULT_FLOOR_SIZE,
        height: DEFAULT_FLOOR_SIZE,
      });
      await insertOpenCells(manager, floor);
    });
    return this.findOne(id);
  }

  /** One transaction, run under the write lock so it never interleaves with a tick. */
  private write<T>(work: (manager: EntityManager) => Promise<T>): Promise<T> {
    return this.lock.run(() => this.dataSource.transaction(work));
  }

  findAll(): Promise<Floor[]> {
    return this.repo.find({ order: { id: 'ASC' } });
  }

  private async findOne(id: number): Promise<Floor> {
    const floor = await this.repo.findOneBy({ id });
    if (!floor) throw new NotFoundException(`Floor ${id} not found`);
    return floor;
  }
}
