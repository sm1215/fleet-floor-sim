import {
  Injectable,
  NotFoundException,
  NotImplementedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Robot } from '../../database/entities/index.js';
import { CreateRobotDto } from './dto/create-robot.dto.js';
import { UpdateRobotDto } from './dto/update-robot.dto.js';

@Injectable()
export class RobotService {
  constructor(
    @InjectRepository(Robot) private readonly repo: Repository<Robot>,
  ) {}

  create({ cellId, ...fields }: CreateRobotDto): Promise<Robot> {
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
