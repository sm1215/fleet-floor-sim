import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cell, Robot } from '../../database/entities/index.js';
import { CreateCellDto } from './dto/create-cell.dto.js';
import { UpdateCellDto } from './dto/update-cell.dto.js';

@Injectable()
export class CellService {
  constructor(
    @InjectRepository(Cell) private readonly repo: Repository<Cell>,
    @InjectRepository(Robot) private readonly robotRepo: Repository<Robot>,
  ) {}

  create({ floorId, ...fields }: CreateCellDto): Promise<Cell> {
    return this.repo.save(
      this.repo.create({ ...fields, floor: { id: floorId } }),
    );
  }

  findAll(): Promise<Cell[]> {
    return this.repo.find({ relations: { floor: true } });
  }

  async findOne(id: number): Promise<Cell> {
    const row = await this.repo.findOne({
      where: { id },
      relations: { floor: true },
    });
    if (!row) throw new NotFoundException(`Cell ${id} not found`);
    return row;
  }

  async update(
    id: number,
    { floorId, ...fields }: UpdateCellDto,
  ): Promise<Cell> {
    await this.findOne(id);
    if (
      fields.obstacle === true &&
      (await this.robotRepo.exists({ where: { cell: { id } } }))
    ) {
      throw new BadRequestException(`Cell ${id} has a robot`);
    }
    await this.repo.save({
      id,
      ...fields,
      ...(floorId === undefined ? {} : { floor: { id: floorId } }),
    });
    return this.findOne(id);
  }

  async remove(id: number): Promise<void> {
    await this.repo.remove(await this.findOne(id));
  }
}
