import { Test } from '@nestjs/testing';
import { QueuedCommandService } from '../queued-command/queued-command.service.js';
import { RobotController } from './robot.controller.js';
import { RobotService } from './robot.service.js';

describe('RobotController', () => {
  const row = { id: 1, direction: 0, cell: { id: 1 } };
  const service = { findAll: vi.fn().mockResolvedValue([row]) };
  const commands = [{ id: 4, command: 'MOVE', params: null }];
  const queuedCommandService = {
    findByRobot: vi.fn().mockResolvedValue(commands),
  };
  let controller: RobotController;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [RobotController],
      providers: [
        { provide: RobotService, useValue: service },
        { provide: QueuedCommandService, useValue: queuedCommandService },
      ],
    }).compile();
    controller = moduleRef.get(RobotController);
  });

  it('findAll', async () => {
    await expect(controller.findAll(2)).resolves.toEqual([row]);
    expect(service.findAll).toHaveBeenCalledWith(2);
  });

  it('findQueuedCommands', async () => {
    await expect(controller.findQueuedCommands(1)).resolves.toEqual(commands);
    expect(queuedCommandService.findByRobot).toHaveBeenCalledWith(1);
  });
});
