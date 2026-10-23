import { Test } from '@nestjs/testing';
import { FloorController } from './floor.controller.js';
import { FloorService } from './floor.service.js';

describe('FloorController', () => {
  const floor = { id: 1, height: 5, width: 5 };
  const service = {
    findAll: vi.fn().mockResolvedValue([floor]),
    reset: vi.fn().mockResolvedValue(floor),
  };
  let controller: FloorController;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [FloorController],
      providers: [{ provide: FloorService, useValue: service }],
    }).compile();
    controller = moduleRef.get(FloorController);
  });

  it('findAll', async () => {
    await expect(controller.findAll()).resolves.toEqual([floor]);
  });

  it('reset', async () => {
    await expect(controller.reset(1)).resolves.toEqual(floor);
    expect(service.reset).toHaveBeenCalledWith(1);
  });
});
