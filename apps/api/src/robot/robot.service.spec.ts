import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  NotImplementedException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import {
  Cell,
  Floor,
  QueuedCommand,
  Robot,
} from '../../database/entities/index.js';
import { sqliteTestDb } from '../../test/sqlite-test-db.js';
import { RobotModule } from './robot.module.js';
import { RobotService } from './robot.service.js';

describe('RobotService', () => {
  const createDto = { direction: 0, cellId: 1 };
  const { cellId, ...fields } = createDto;
  const row = { id: 1, ...fields, cell: { id: cellId } };
  let repo: Record<string, ReturnType<typeof vi.fn>>;
  let cellRepo: Record<string, ReturnType<typeof vi.fn>>;
  let commandRepo: Record<string, ReturnType<typeof vi.fn>>;
  let service: RobotService;

  beforeEach(async () => {
    repo = {
      create: vi.fn((dto: object) => dto),
      save: vi.fn((entity: object) => Promise.resolve({ id: 1, ...entity })),
      find: vi.fn().mockResolvedValue([row]),
      findOne: vi.fn().mockResolvedValue(row),
      remove: vi.fn().mockResolvedValue(row),
      exists: vi.fn().mockResolvedValue(false),
      update: vi.fn().mockResolvedValue(undefined),
    };
    commandRepo = { delete: vi.fn().mockResolvedValue(undefined) };
    const manager = {
      transaction: (run: (m: object) => unknown) =>
        run({
          getRepository: (entity: unknown) =>
            entity === QueuedCommand ? commandRepo : repo,
        }),
    };
    cellRepo = {
      findOne: vi.fn().mockResolvedValue({ id: cellId, obstacle: false }),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        RobotService,
        { provide: getRepositoryToken(Robot), useValue: { ...repo, manager } },
        { provide: getRepositoryToken(Cell), useValue: cellRepo },
      ],
    }).compile();
    service = moduleRef.get(RobotService);
  });

  it('maps cellId to the cell relation on create', async () => {
    await expect(service.create(createDto)).resolves.toEqual({
      ...row,
      displayId: 1,
    });
    expect(repo.save).toHaveBeenCalledWith({
      ...fields,
      displayId: -1,
      cell: { id: cellId },
    });
    expect(repo.update).toHaveBeenCalledWith(1, { displayId: 1 });
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

  it('removes a row and its queued commands', async () => {
    await service.remove(1);
    expect(commandRepo.delete).toHaveBeenCalledWith({ robot: { id: 1 } });
    expect(repo.remove).toHaveBeenCalledWith(row);
  });
});

describe('RobotService engine placeholders', () => {
  it.each(['reportState'] as const)(
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

describe('RobotService displayId (SQLite)', () => {
  let dataSource: DataSource;
  let service: RobotService;
  let cellIds: number[];

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [sqliteTestDb(':memory:'), RobotModule],
    }).compile();
    dataSource = moduleRef.get(DataSource);
    service = moduleRef.get(RobotService);
    const floor = await dataSource
      .getRepository(Floor)
      .save({ width: 3, height: 1 });
    const cells = await dataSource.getRepository(Cell).save(
      [0, 1, 2].map((x) => ({
        obstacle: false,
        xPosition: x,
        yPosition: 0,
        floor,
      })),
    );
    cellIds = cells.map((c) => c.id);
  });

  afterEach(async () => {
    await dataSource.destroy();
  });

  it('create without displayId sets displayId = id', async () => {
    const first = await service.create({ direction: 0, cellId: cellIds[0] });
    const second = await service.create({ direction: 0, cellId: cellIds[1] });
    expect(first.displayId).toBe(first.id);
    expect(second.displayId).toBe(second.id);
    const stored = await dataSource.getRepository(Robot).find();
    expect(stored.every((r) => r.displayId === r.id)).toBe(true);
  });

  it('create with displayId 7 stores 7', async () => {
    const robot = await service.create({
      direction: 0,
      cellId: cellIds[0],
      displayId: 7,
    });
    expect(robot.displayId).toBe(7);
    await expect(service.findOne(robot.id)).resolves.toMatchObject({
      displayId: 7,
    });
  });

  it('create with a displayId already in use → ConflictException', async () => {
    await service.create({ direction: 0, cellId: cellIds[0], displayId: 4 });
    await expect(
      service.create({ direction: 0, cellId: cellIds[1], displayId: 4 }),
    ).rejects.toThrow(ConflictException);
    await expect(dataSource.getRepository(Robot).count()).resolves.toBe(1);
  });

  it('remove deletes the robot and only its queued commands', async () => {
    const kept = await service.create({ direction: 0, cellId: cellIds[0] });
    const gone = await service.create({ direction: 0, cellId: cellIds[1] });
    const commands = dataSource.getRepository(QueuedCommand);
    await commands.save([
      { command: 'MOVE', robot: { id: kept.id } },
      { command: 'MOVE', robot: { id: gone.id } },
      { command: 'LEFT', robot: { id: gone.id } },
    ]);
    await service.remove(gone.id);
    await expect(service.findOne(gone.id)).rejects.toThrow(NotFoundException);
    const left = await commands.find({ relations: { robot: true } });
    expect(left.map((c) => c.robot.id)).toEqual([kept.id]);
  });
});
