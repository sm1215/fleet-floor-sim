import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Cell } from '../../database/entities/index.js';
import { CellService } from './cell.service.js';

describe('CellService', () => {
  const createDto = { obstacle: true, xPosition: 1, yPosition: 2, floorId: 1 };
  const { floorId, ...fields } = createDto;
  const row = { id: 1, ...fields, floor: { id: floorId } };
  let repo: Record<string, ReturnType<typeof vi.fn>>;
  let service: CellService;

  beforeEach(async () => {
    repo = {
      create: vi.fn((dto: object) => dto),
      save: vi.fn((entity: object) => Promise.resolve({ id: 1, ...entity })),
      find: vi.fn().mockResolvedValue([row]),
      findOne: vi.fn().mockResolvedValue(row),
      remove: vi.fn().mockResolvedValue(row),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        CellService,
        { provide: getRepositoryToken(Cell), useValue: repo },
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

  it('removes a row', async () => {
    await service.remove(1);
    expect(repo.remove).toHaveBeenCalledWith(row);
  });
});
