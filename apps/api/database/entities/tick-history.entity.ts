import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import type { Relation } from 'typeorm';
import { Floor } from './floor.entity.js';

/** A snapshot of a floor's state at a tick (timeline.md). */
@Entity('tick_history')
@Unique(['floor', 'tick'])
export class TickHistory {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'integer' })
  tick: number;

  /** JSON `FloorState`. */
  @Column({ type: 'varchar' })
  state: string;

  @ManyToOne(() => Floor)
  @JoinColumn({ name: 'floor_id' })
  floor: Relation<Floor>;
}
