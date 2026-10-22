import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { Cell, Floor, Robot } from '../../database/entities/index.js';
import { CreateFloorDto } from './dto/create-floor.dto.js';
import { UpdateFloorDto } from './dto/update-floor.dto.js';
import { planResize, RESIZE_NO_ROOM } from './floor.model.js';

@Injectable()
export class FloorService {
  constructor(
    @InjectRepository(Floor) private readonly repo: Repository<Floor>,
    private readonly dataSource: DataSource,
  ) {}

  create(dto: CreateFloorDto): Promise<Floor> {
    return this.dataSource.transaction(async (manager) => {
      const floor = await manager.getRepository(Floor).save(dto);
      const cells = manager.getRepository(Cell);
      const rows: Partial<Cell>[] = [];
      for (let y = 0; y < floor.height; y++) {
        for (let x = 0; x < floor.width; x++) {
          rows.push({ obstacle: false, xPosition: x, yPosition: y, floor });
        }
      }
      await cells.insert(rows);
      return floor;
    });
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
    await this.dataSource.transaction(async (manager) => {
      const cellRepo = manager.getRepository(Cell);
      const robotRepo = manager.getRepository(Robot);
      const cells = await cellRepo.findBy({ floor: { id } });
      const robots = await robotRepo.find({
        where: { cell: { floor: { id } } },
        relations: { cell: true },
      });
      const plan = planResize(
        size,
        cells,
        robots.map((r) => ({ id: r.id, cellId: r.cell.id })),
      );
      if (!plan) throw new ConflictException(RESIZE_NO_ROOM);

      await manager.getRepository(Floor).save({ id, ...size });
      if (plan.create.length > 0) {
        await cellRepo.insert(
          plan.create.map(({ x, y }) => ({
            obstacle: false,
            xPosition: x,
            yPosition: y,
            floor: { id },
          })),
        );
      }
      for (const { robotId, to } of plan.moves) {
        const target = await cellRepo.findOneByOrFail({
          floor: { id },
          xPosition: to.x,
          yPosition: to.y,
        });
        await robotRepo.update(robotId, { cell: { id: target.id } });
      }
      if (plan.deleteCellIds.length > 0) {
        await cellRepo.delete({ id: In(plan.deleteCellIds) });
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
