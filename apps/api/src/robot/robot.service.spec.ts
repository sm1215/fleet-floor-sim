import { NotImplementedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Robot } from '../../database/entities/index.js';
import { RobotService } from './robot.service.js';

describe('RobotService', () => {
  const row = { id: 1, displayId: 1, direction: 0, cell: { id: 1 } };
  let repo: Record<string, ReturnType<typeof vi.fn>>;
  let service: RobotService;

  beforeEach(async () => {
    repo = { find: vi.fn().mockResolvedValue([row]) };
    const moduleRef = await Test.createTestingModule({
      providers: [
        RobotService,
        { provide: getRepositoryToken(Robot), useValue: repo },
      ],
    }).compile();
    service = moduleRef.get(RobotService);
  });

  it("finds one floor's robots with the cell relation", async () => {
    await expect(service.findAll(2)).resolves.toEqual([row]);
    expect(repo.find).toHaveBeenCalledWith({
      where: { cell: { floor: { id: 2 } } },
      relations: { cell: true },
    });
  });

  it('reportState is not implemented yet', async () => {
    await expect(service.reportState(1)).rejects.toThrow(
      NotImplementedException,
    );
  });
});
