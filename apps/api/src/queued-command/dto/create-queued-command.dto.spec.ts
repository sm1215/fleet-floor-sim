import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateQueuedCommandDto } from './create-queued-command.dto.js';

async function errorsFor(body: Record<string, unknown>) {
  return validate(plainToInstance(CreateQueuedCommandDto, body));
}

describe('CreateQueuedCommandDto', () => {
  it.each(['MOVE', 'LEFT', 'RIGHT'])('accepts %s', async (command) => {
    await expect(errorsFor({ command, robotId: 1 })).resolves.toEqual([]);
  });

  it.each(['TURN_LEFT', 'TURN_RIGHT', 'left', 'JUMP'])(
    'rejects %s',
    async (command) => {
      const errors = await errorsFor({ command, robotId: 1 });
      expect(errors.map((e) => e.property)).toEqual(['command']);
    },
  );

  it('accepts a missing params', async () => {
    await expect(errorsFor({ command: 'MOVE', robotId: 1 })).resolves.toEqual(
      [],
    );
  });

  it('rejects a null params', async () => {
    const errors = await errorsFor({
      command: 'MOVE',
      params: null,
      robotId: 1,
    });
    expect(errors.map((e) => e.property)).toEqual(['params']);
  });
});
