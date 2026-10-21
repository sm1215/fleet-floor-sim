import { Test } from '@nestjs/testing';
import { LogEntryController } from './log-entry.controller.js';
import { LogEntryService } from './log-entry.service.js';

describe('LogEntryController', () => {
  const createDto = { action: 'place', params: '1,2', result: 'ok' };
  const updateDto = { result: 'blocked' };
  const row = { id: 1, ...createDto };
  const service = {
    create: vi.fn().mockResolvedValue(row),
    findAll: vi.fn().mockResolvedValue([row]),
    findOne: vi.fn().mockResolvedValue(row),
    update: vi.fn().mockResolvedValue({ ...row, ...updateDto }),
    remove: vi.fn().mockResolvedValue(undefined),
  };
  let controller: LogEntryController;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [LogEntryController],
      providers: [{ provide: LogEntryService, useValue: service }],
    }).compile();
    controller = moduleRef.get(LogEntryController);
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
