import { Test } from '@nestjs/testing';
import { CellController } from './cell.controller.js';
import { CellService } from './cell.service.js';

describe('CellController', () => {
  const row = { id: 1, obstacle: true, xPosition: 1, yPosition: 2 };
  const service = { findAll: vi.fn().mockResolvedValue([row]) };
  let controller: CellController;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [CellController],
      providers: [{ provide: CellService, useValue: service }],
    }).compile();
    controller = moduleRef.get(CellController);
  });

  it('findAll', async () => {
    await expect(controller.findAll()).resolves.toEqual([row]);
  });
});
