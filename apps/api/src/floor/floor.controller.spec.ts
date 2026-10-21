import { Test } from '@nestjs/testing';
import { FloorController } from './floor.controller.js';
import { FloorService } from './floor.service.js';

describe('FloorController', () => {
  const floor = { id: 1, height: 5, width: 5 };
  const service = {
    create: vi.fn().mockResolvedValue(floor),
    findAll: vi.fn().mockResolvedValue([floor]),
    findOne: vi.fn().mockResolvedValue(floor),
    update: vi.fn().mockResolvedValue({ ...floor, width: 6 }),
    remove: vi.fn().mockResolvedValue(undefined),
  };
  let controller: FloorController;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [FloorController],
      providers: [{ provide: FloorService, useValue: service }],
    }).compile();
    controller = moduleRef.get(FloorController);
  });

  it('create', async () => {
    await expect(controller.create({ height: 5, width: 5 })).resolves.toEqual(
      floor,
    );
    expect(service.create).toHaveBeenCalledWith({ height: 5, width: 5 });
  });

  it('findAll', async () => {
    await expect(controller.findAll()).resolves.toEqual([floor]);
  });

  it('findOne', async () => {
    await expect(controller.findOne(1)).resolves.toEqual(floor);
    expect(service.findOne).toHaveBeenCalledWith(1);
  });

  it('update', async () => {
    await expect(controller.update(1, { width: 6 })).resolves.toEqual({
      ...floor,
      width: 6,
    });
    expect(service.update).toHaveBeenCalledWith(1, { width: 6 });
  });

  it('remove', async () => {
    await expect(controller.remove(1)).resolves.toBeUndefined();
    expect(service.remove).toHaveBeenCalledWith(1);
  });
});
