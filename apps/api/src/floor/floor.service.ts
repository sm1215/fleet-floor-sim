import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import {
  Cell,
  Floor,
  LogEntry,
  QueuedCommand,
  Robot,
} from '../../database/entities/index.js';
import { EngineService } from '../engine/engine.service.js';
import { WriteLock } from '../shared/write-lock.js';
import { CreateFloorDto } from './dto/create-floor.dto.js';
import { UpdateFloorDto } from './dto/update-floor.dto.js';
import { insertOpenCells, resizeFloor } from './floor-writes.js';
import { DEFAULT_FLOOR_SIZE, RESIZE_NO_ROOM } from './floor.model.js';

@Injectable()
export class FloorService {
  constructor(
    @InjectRepository(Floor) private readonly repo: Repository<Floor>,
    private readonly dataSource: DataSource,
    private readonly engine: EngineService,
    private readonly lock: WriteLock,
  ) {}

  create(dto: CreateFloorDto): Promise<Floor> {
    return this.dataSource.transaction(async (manager) => {
      const floor = await manager.getRepository(Floor).save(dto);
      await insertOpenCells(manager, floor);
      return floor;
    });
  }

  /**
   * Pauses the engine at tick 0, then empties the floor (queued commands,
   * robots, cells) and the whole log, and rebuilds it as an all-Open
   * DEFAULT_FLOOR_SIZE square. The floor keeps its id.
   */
  async reset(id: number): Promise<Floor> {
    await this.findOne(id);
    // Taken after engine.reset(): that waits for an in-flight tick, which needs the lock.
    await this.engine.reset();
    await this.write(async (manager) => {
      const robotRepo = manager.getRepository(Robot);
      const robotIds = (
        await robotRepo.find({
          select: { id: true },
          where: { cell: { floor: { id } } },
        })
      ).map((r) => r.id);
      if (robotIds.length > 0) {
        await manager
          .getRepository(QueuedCommand)
          .delete({ robot: { id: In(robotIds) } });
        await robotRepo.delete({ id: In(robotIds) });
      }
      await manager.getRepository(Cell).delete({ floor: { id } });
      await manager.getRepository(LogEntry).clear();
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
    return this.repo.find();
  }

  async findOne(id: number): Promise<Floor> {
    const floor = await this.repo.findOneBy({ id });
    if (!floor) throw new NotFoundException(`Floor ${id} not found`);
    return floor;
  }

  async update(id: number, dto: UpdateFloorDto): Promise<Floor> {
    const floor = await this.findOne(id);
    const size = {
      width: dto.width ?? floor.width,
      height: dto.height ?? floor.height,
    };
    await this.write(async (manager) => {
      if (!(await resizeFloor(manager, id, size))) {
        throw new ConflictException(RESIZE_NO_ROOM);
      }
    });
    return this.findOne(id);
  }

  async remove(id: number): Promise<void> {
    const floor = await this.findOne(id);
    await this.dataSource.transaction(async (manager) => {
      await manager.getRepository(Cell).delete({ floor: { id } });
      await manager.getRepository(Floor).remove(floor);
    });
  }
}
