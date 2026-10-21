import { Test } from '@nestjs/testing';
import { QueuedCommandController } from './queued-command.controller.js';
import { QueuedCommandService } from './queued-command.service.js';

describe('QueuedCommandController', () => {
  const createDto = { command: 'MOVE' as const, params: '', robotId: 1 };
  const updateDto = { command: 'TURN_LEFT' as const };
  const row = { id: 1, ...createDto };
  const service = {
    create: vi.fn().mockResolvedValue(row),
    findAll: vi.fn().mockResolvedValue([row]),
    findOne: vi.fn().mockResolvedValue(row),
    update: vi.fn().mockResolvedValue({ ...row, ...updateDto }),
    remove: vi.fn().mockResolvedValue(undefined),
  };
  let controller: QueuedCommandController;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [QueuedCommandController],
      providers: [{ provide: QueuedCommandService, useValue: service }],
    }).compile();
    controller = moduleRef.get(QueuedCommandController);
  });

  it('create', async () => {
    await expect(controller.create(createDto)).resolves.toEqual(row);
    expect(service.create).toHaveBeenCalledWith(createDto);
  });

  it('findAll', async () => {
    await expect(controller.findAll()).resolves.toEqual([row]);
  });

  it('findOne', async () => {
    await expect(controller.findOne(1)).resolves.toEqual(row);
    expect(service.findOne).toHaveBeenCalledWith(1);
  });

  it('update', async () => {
    await expect(controller.update(1, updateDto)).resolves.toEqual({
      ...row,
      ...updateDto,
    });
    expect(service.update).toHaveBeenCalledWith(1, updateDto);
  });

  it('remove', async () => {
    await expect(controller.remove(1)).resolves.toBeUndefined();
    expect(service.remove).toHaveBeenCalledWith(1);
  });
});
