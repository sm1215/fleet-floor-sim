import {
  BadRequestException,
  Injectable,
  NotFoundException,
  NotImplementedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cell, Robot } from '../../database/entities/index.js';
import { CreateRobotDto } from './dto/create-robot.dto.js';
import { UpdateRobotDto } from './dto/update-robot.dto.js';

@Injectable()
export class RobotService {
  constructor(
    @InjectRepository(Robot) private readonly repo: Repository<Robot>,
    @InjectRepository(Cell) private readonly cellRepo: Repository<Cell>,
  ) {}

  /** Places a robot on an existing Open cell with no robot on it. */
  async create({ cellId, ...fields }: CreateRobotDto): Promise<Robot> {
    const cell = await this.cellRepo.findOne({ where: { id: cellId } });
    if (!cell) throw new BadRequestException(`Cell ${cellId} not found`);
    if (cell.obstacle) {
      throw new BadRequestException(`Cell ${cellId} is an Obstacle`);
    }
    if (await this.repo.exists({ where: { cell: { id: cellId } } })) {
      throw new BadRequestException(`Cell ${cellId} already has a robot`);
    }
    return this.repo.save(
      this.repo.create({ ...fields, cell: { id: cellId } }),
    );
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

  async remove(id: number): Promise<void> {
    await this.repo.remove(await this.findOne(id));
  }

  // Engine placeholders, not exposed over HTTP.
  /* eslint-disable @typescript-eslint/require-await */
  async turnLeft(id: number): Promise<Robot> {
    throw new NotImplementedException(`turnLeft(${id})`);
  }

  async turnRight(id: number): Promise<Robot> {
    throw new NotImplementedException(`turnRight(${id})`);
  }

  async move(id: number): Promise<Robot> {
    throw new NotImplementedException(`move(${id})`);
  }

  async reportState(id: number): Promise<Robot> {
    throw new NotImplementedException(`reportState(${id})`);
  }
  /* eslint-enable @typescript-eslint/require-await */
}
