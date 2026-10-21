import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Floor } from '../../database/entities/index.js';
import { CreateFloorDto } from './dto/create-floor.dto.js';
import { UpdateFloorDto } from './dto/update-floor.dto.js';

@Injectable()
export class FloorService {
  constructor(
    @InjectRepository(Floor) private readonly repo: Repository<Floor>,
  ) {}

  create(dto: CreateFloorDto): Promise<Floor> {
    return this.repo.save(this.repo.create(dto));
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
    await this.findOne(id);
    await this.repo.save({ id, ...dto });
    return this.findOne(id);
  }

  async remove(id: number): Promise<void> {
    await this.repo.remove(await this.findOne(id));
  }
}
