import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cell } from '../../database/entities/index.js';

@Injectable()
export class CellService {
  constructor(
    @InjectRepository(Cell) private readonly repo: Repository<Cell>,
  ) {}

  findAll(): Promise<Cell[]> {
    return this.repo.find({ relations: { floor: true } });
  }
}
