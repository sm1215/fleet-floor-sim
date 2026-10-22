import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  NotImplementedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cell, QueuedCommand, Robot } from '../../database/entities/index.js';
import { CreateRobotDto } from './dto/create-robot.dto.js';
import { UpdateRobotDto } from './dto/update-robot.dto.js';

/** Held by a new robot only until its id is copied into displayId. */
const DISPLAY_ID_PLACEHOLDER = -1;

function isUniqueViolation(error: unknown): boolean {
  return (
    (error as { code?: string } | null)?.code === 'SQLITE_CONSTRAINT_UNIQUE'
  );
}

@Injectable()
export class RobotService {
  constructor(
    @InjectRepository(Robot) private readonly repo: Repository<Robot>,
    @InjectRepository(Cell) private readonly cellRepo: Repository<Cell>,
  ) {}

  /** Places a robot on an existing Open cell with no robot on it. */
  async create({
    cellId,
    displayId,
    ...fields
  }: CreateRobotDto): Promise<Robot> {
    const cell = await this.cellRepo.findOne({ where: { id: cellId } });
    if (!cell) throw new BadRequestException(`Cell ${cellId} not found`);
    if (cell.obstacle) {
      throw new BadRequestException(`Cell ${cellId} is an Obstacle`);
    }
    if (await this.repo.exists({ where: { cell: { id: cellId } } })) {
      throw new BadRequestException(`Cell ${cellId} already has a robot`);
    }
    try {
      return await this.repo.manager.transaction(async (manager) => {
        const repo = manager.getRepository(Robot);
        // displayId is NOT NULL and unique, but the id only exists after the
        // insert: save a placeholder, then copy the new id into it.
        const saved = await repo.save(
          repo.create({
            ...fields,
            displayId: displayId ?? DISPLAY_ID_PLACEHOLDER,
            cell: { id: cellId },
          }),
        );
        if (displayId === undefined) {
          await repo.update(saved.id, { displayId: saved.id });
          saved.displayId = saved.id;
        }
        return saved;
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException(
          `Robot displayId ${displayId ?? 'for the new id'} already exists`,
        );
      }
      throw error;
    }
  }

  findAll(): Promise<Robot[]> {
    return this.repo.find({ relations: { cell: true } });
  }

  async findOne(id: number): Promise<Robot> {
    const row = await this.repo.findOne({
      where: { id },
      relations: { cell: true },
    });
    if (!row) throw new NotFoundException(`Robot ${id} not found`);
    return row;
  }

  async update(
    id: number,
    { cellId, ...fields }: UpdateRobotDto,
  ): Promise<Robot> {
    await this.findOne(id);
    await this.repo.save({
      id,
      ...fields,
      ...(cellId === undefined ? {} : { cell: { id: cellId } }),
    });
    return this.findOne(id);
  }

  /** Deletes the robot's queued commands with it: QueuedCommand has an FK to Robot. */
  async remove(id: number): Promise<void> {
    const robot = await this.findOne(id);
    await this.repo.manager.transaction(async (manager) => {
      await manager.getRepository(QueuedCommand).delete({ robot: { id } });
      await manager.getRepository(Robot).remove(robot);
    });
  }

  // REPORT placeholder, not exposed over HTTP. LEFT / RIGHT / MOVE are
  // applied by EngineCommandsService.
  /* eslint-disable @typescript-eslint/require-await */
  async reportState(id: number): Promise<Robot> {
    throw new NotImplementedException(`reportState(${id})`);
  }
  /* eslint-enable @typescript-eslint/require-await */
}
