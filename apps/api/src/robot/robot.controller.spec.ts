import { Test } from '@nestjs/testing';
import { RobotController } from './robot.controller.js';
import { RobotService } from './robot.service.js';

describe('RobotController', () => {
  const createDto = { direction: 0, cellId: 1 };
  const updateDto = { direction: 2 };
  const row = { id: 1, ...createDto };
  const service = {
    create: vi.fn().mockResolvedValue(row),
    findAll: vi.fn().mockResolvedValue([row]),
    findOne: vi.fn().mockResolvedValue(row),
    update: vi.fn().mockResolvedValue({ ...row, ...updateDto }),
    remove: vi.fn().mockResolvedValue(undefined),
  };
  let controller: RobotController;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [RobotController],
      providers: [{ provide: RobotService, useValue: service }],
    }).compile();
    controller = moduleRef.get(RobotController);
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
