import { Test } from '@nestjs/testing';
import { LogEntryController } from './log-entry.controller.js';
import { LogEntryService } from './log-entry.service.js';

describe('LogEntryController', () => {
  const row = {
    id: 1,
    action: 'PLACE',
    params: 'R1 1, 2, NORTH',
    result: 'OK',
  };
  const service = { findAll: vi.fn().mockResolvedValue([row]) };
  let controller: LogEntryController;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [LogEntryController],
      providers: [{ provide: LogEntryService, useValue: service }],
    }).compile();
    controller = moduleRef.get(LogEntryController);
  });

  it('findAll', async () => {
    await expect(controller.findAll()).resolves.toEqual([row]);
  });
});
