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
      { id: 1, command: 'MOVE', params: '', robotId: 3 },
      { id: 2, command: 'TURN_LEFT', params: '', robotId: 3 },
      { id: 3, command: 'TURN_RIGHT', params: '', robotId: 3 },
    ];
    const el = await render(3, commands);
    const items = Array.from(el.querySelectorAll('li')).map((li) => li.textContent?.trim());
    expect(items).toEqual(['MOVE', 'TURN_LEFT', 'TURN_RIGHT']);
  });
});
