import { Injectable, Module } from '@nestjs/common';

/**
 * Runs DB writes one at a time. TypeORM shares a single SQLite connection,
 * so without this a tick and an OBSTACLE write can interleave and leave a
 * robot on an Obstacle.
 */
@Injectable()
export class WriteLock {
  private tail: Promise<unknown> = Promise.resolve();

  run<T>(task: () => Promise<T>): Promise<T> {
    const result = this.tail.then(task);
    this.tail = result.catch(() => undefined);
    return result;
  }
}

@Module({ providers: [WriteLock], exports: [WriteLock] })
export class WriteLockModule {}
