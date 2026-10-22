import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Cell, Robot } from '../../database/entities/index.js';
import { WriteLock } from '../shared/write-lock.js';
import { CellService } from './cell.service.js';

describe('CellService', () => {
  const createDto = { obstacle: true, xPosition: 1, yPosition: 2, floorId: 1 };
  const { floorId, ...fields } = createDto;
  const row = { id: 1, ...fields, floor: { id: floorId } };
  let repo: Record<string, ReturnType<typeof vi.fn>>;
  let robotRepo: Record<string, ReturnType<typeof vi.fn>>;
  let service: CellService;
  let lock: WriteLock;

  beforeEach(async () => {
    repo = {
      create: vi.fn((dto: object) => dto),
      save: vi.fn((entity: object) => Promise.resolve({ id: 1, ...entity })),
      find: vi.fn().mockResolvedValue([row]),
      findOne: vi.fn().mockResolvedValue(row),
      remove: vi.fn().mockResolvedValue(row),
    };
    robotRepo = { exists: vi.fn().mockResolvedValue(false) };
    const moduleRef = await Test.createTestingModule({
      providers: [
        CellService,
        { provide: WriteLock, useFactory: () => (lock = new WriteLock()) },
        { provide: getRepositoryToken(Cell), useValue: repo },
        { provide: getRepositoryToken(Robot), useValue: robotRepo },
      ],
    }).compile();
    service = moduleRef.get(CellService);
  });

  it('maps floorId to the floor relation on create', async () => {
    await expect(service.create(createDto)).resolves.toEqual(row);
    expect(repo.save).toHaveBeenCalledWith({
      ...fields,
      floor: { id: floorId },
    });
  });

  it('finds all with the floor relation', async () => {
    await expect(service.findAll()).resolves.toEqual([row]);
    expect(repo.find).toHaveBeenCalledWith({ relations: { floor: true } });
  });

  it('finds one with the floor relation', async () => {
    await expect(service.findOne(1)).resolves.toEqual(row);
    expect(repo.findOne).toHaveBeenCalledWith({
      where: { id: 1 },
      relations: { floor: true },
    });
  });

  it('throws 404 when the row is missing', async () => {
    repo.findOne.mockResolvedValue(null);
    await expect(service.findOne(9)).rejects.toThrow(NotFoundException);
    await expect(service.update(9, {})).rejects.toThrow(NotFoundException);
    await expect(service.remove(9)).rejects.toThrow(NotFoundException);
  });

  it('maps floorId on update and leaves the relation alone when absent', async () => {
    await service.update(1, { floorId: 7 });
    expect(repo.save).toHaveBeenLastCalledWith({ id: 1, floor: { id: 7 } });
    await service.update(1, {});
    expect(repo.save).toHaveBeenLastCalledWith({ id: 1 });
  });

  it('rejects obstacle: true on a cell with a robot; the cell is unchanged', async () => {
    robotRepo.exists.mockResolvedValue(true);
    await expect(service.update(1, { obstacle: true })).rejects.toThrow(
      BadRequestException,
    );
    expect(robotRepo.exists).toHaveBeenCalledWith({
      where: { cell: { id: 1 } },
    });
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('allows obstacle: false on a cell with a robot', async () => {
    robotRepo.exists.mockResolvedValue(true);
    await service.update(1, { obstacle: false });
    expect(repo.save).toHaveBeenCalledWith({ id: 1, obstacle: false });
  });

  it('removes a row', async () => {
    await service.remove(1);
    expect(repo.remove).toHaveBeenCalledWith(row);
  });

  it('update waits for the write lock', async () => {
    let release!: () => void;
    const held = lock.run(() => new Promise<void>((r) => (release = r)));
    const updating = service.update(1, { obstacle: true });
    await new Promise((r) => setTimeout(r, 0));
    expect(repo.save).not.toHaveBeenCalled();
    release();
    await held;
    await updating;
    expect(repo.save).toHaveBeenCalled();
  });
});
