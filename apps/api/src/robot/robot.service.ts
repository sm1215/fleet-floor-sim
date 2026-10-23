import { Injectable, NotImplementedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Robot } from '../../database/entities/index.js';

@Injectable()
export class RobotService {
  constructor(
    @InjectRepository(Robot) private readonly repo: Repository<Robot>,
  ) {}

  /** One floor's robots, with their cells. */
  findAll(floorId: number): Promise<Robot[]> {
    return this.repo.find({
      where: { cell: { floor: { id: floorId } } },
      relations: { cell: true },
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
