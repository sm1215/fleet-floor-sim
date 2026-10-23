import { TestBed } from '@angular/core/testing';
import { QueuedCommand } from '../../models/queued-command.model';
import { QueuePanel } from './queue-panel';

describe('QueuePanel', () => {
  async function render(robotId: number | null, commands: QueuedCommand[]) {
    const fixture = TestBed.createComponent(QueuePanel);
    fixture.componentRef.setInput('robotId', robotId);
    fixture.componentRef.setInput('commands', commands);
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  it('titles the panel with the robot ID', async () => {
    const el = await render(3, []);
    expect(el.querySelector('h2')?.textContent?.trim()).toBe('R3 Queue');
  });

  it('renders commands in FIFO order', async () => {
    const commands: QueuedCommand[] = [
      { id: 1, command: 'MOVE', params: null, robotId: 3 },
      { id: 2, command: 'LEFT', params: null, robotId: 3 },
      { id: 3, command: 'RIGHT', params: null, robotId: 3 },
    ];
    const el = await render(3, commands);
    const items = Array.from(el.querySelectorAll('li')).map((li) => li.textContent?.trim());
    expect(items).toEqual(['MOVE', 'LEFT', 'RIGHT']);
  });

  it('shows params after the command only when there are some', async () => {
    const commands: QueuedCommand[] = [
      { id: 1, command: 'GOTO', params: '3,4', robotId: 3 },
      { id: 2, command: 'MOVE', params: null, robotId: 3 },
    ];
    const el = await render(3, commands);
    const items = Array.from(el.querySelectorAll('li')).map((li) => li.textContent?.trim());
    expect(items).toEqual(['GOTO 3,4', 'MOVE']);
  });
});
