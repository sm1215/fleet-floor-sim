import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  OnModuleDestroy,
} from '@nestjs/common';
import { Engine } from '../../../engine/engine.js';

export interface EngineState {
  currentTick: number;
  tickRate: number;
  running: boolean;
  /** Errors from automatic steps since the last read. */
  errors: string[];
}

export const STEP_WHILE_RUNNING =
  'Cannot step while the simulation is running. Pause it first.';

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

@Injectable()
export class EngineService implements OnModuleDestroy {
  private errors: string[] = [];
  private readonly engine = new Engine((error) =>
    this.errors.push(errorMessage(error)),
  );

  /** Current state; the returned errors are cleared. */
  getState(): EngineState {
    const errors = this.errors;
    this.errors = [];
    return {
      currentTick: this.engine.currentTick,
      tickRate: this.engine.tickRate,
      running: this.engine.running,
      errors,
    };
  }

  /** Manual steps are rejected while running so they never overlap automatic ones. */
  async step(): Promise<EngineState> {
    if (this.engine.running) {
      throw new BadRequestException(STEP_WHILE_RUNNING);
    }
    try {
      await this.engine.step();
    } catch (error) {
      throw new InternalServerErrorException(errorMessage(error));
    }
    return this.getState();
  }

  toggle(): EngineState {
    this.engine.toggle();
    return this.getState();
  }

  onModuleDestroy(): void {
    this.engine.stop();
  }
}
