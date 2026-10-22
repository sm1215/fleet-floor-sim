import {
  BadRequestException,
  NotFoundException,
  NotImplementedException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Cell, Robot } from '../../database/entities/index.js';
import { RobotService } from './robot.service.js';

describe('RobotService', () => {
  const createDto = { direction: 0, cellId: 1 };
  const { cellId, ...fields } = createDto;
  const row = { id: 1, ...fields, cell: { id: cellId } };
  let repo: Record<string, ReturnType<typeof vi.fn>>;
  let cellRepo: Record<string, ReturnType<typeof vi.fn>>;
  let service: RobotService;

  beforeEach(async () => {
    repo = {
      create: vi.fn((dto: object) => dto),
      save: vi.fn((entity: object) => Promise.resolve({ id: 1, ...entity })),
      find: vi.fn().mockResolvedValue([row]),
      findOne: vi.fn().mockResolvedValue(row),
      remove: vi.fn().mockResolvedValue(row),
      exists: vi.fn().mockResolvedValue(false),
    };
    cellRepo = {
      findOne: vi.fn().mockResolvedValue({ id: cellId, obstacle: false }),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        RobotService,
        { provide: getRepositoryToken(Robot), useValue: repo },
        { provide: getRepositoryToken(Cell), useValue: cellRepo },
      ],
    }).compile();
    service = moduleRef.get(RobotService);
  });

  it('maps cellId to the cell relation on create', async () => {
    await expect(service.create(createDto)).resolves.toEqual(row);
    expect(repo.save).toHaveBeenCalledWith({ ...fields, cell: { id: cellId } });
  });

  it('rejects create on an Obstacle cell and creates nothing', async () => {
    cellRepo.findOne.mockResolvedValue({ id: cellId, obstacle: true });
    await expect(service.create(createDto)).rejects.toThrow(
      BadRequestException,
    );
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('rejects create on an occupied cell and creates nothing', async () => {
    repo.exists.mockResolvedValue(true);
    await expect(service.create(createDto)).rejects.toThrow(
      BadRequestException,
    );
    expect(repo.exists).toHaveBeenCalledWith({
      where: { cell: { id: cellId } },
    });
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('rejects create on a missing cell (outside the grid)', async () => {
    cellRepo.findOne.mockResolvedValue(null);
    await expect(service.create(createDto)).rejects.toThrow(
      BadRequestException,
    );
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('finds all with the cell relation', async () => {
    await expect(service.findAll()).resolves.toEqual([row]);
    expect(repo.find).toHaveBeenCalledWith({ relations: { cell: true } });
  });

  it('finds one with the cell relation', async () => {
    await expect(service.findOne(1)).resolves.toEqual(row);
    expect(repo.findOne).toHaveBeenCalledWith({
      where: { id: 1 },
      relations: { cell: true },
    });
  });

  it('throws 404 when the row is missing', async () => {
    repo.findOne.mockResolvedValue(null);
    await expect(service.findOne(9)).rejects.toThrow(NotFoundException);
    await expect(service.update(9, {})).rejects.toThrow(NotFoundException);
    await expect(service.remove(9)).rejects.toThrow(NotFoundException);
  });

  it('maps cellId on update and leaves the relation alone when absent', async () => {
    await service.update(1, { cellId: 7 });
    expect(repo.save).toHaveBeenLastCalledWith({ id: 1, cell: { id: 7 } });
    await service.update(1, {});
    expect(repo.save).toHaveBeenLastCalledWith({ id: 1 });
  });

  it('removes a row', async () => {
    await service.remove(1);
    expect(repo.remove).toHaveBeenCalledWith(row);
  });
});

describe('RobotService engine placeholders', () => {
  it.each(['turnLeft', 'turnRight', 'move', 'reportState'] as const)(
    '%s is not implemented yet',
    async (method) => {
      const moduleRef = await Test.createTestingModule({
        providers: [
          RobotService,
          { provide: getRepositoryToken(Robot), useValue: {} },
          { provide: getRepositoryToken(Cell), useValue: {} },
        ],
      }).compile();
      const service = moduleRef.get(RobotService);
      await expect(service[method](1)).rejects.toThrow(NotImplementedException);
    },
  );
});
