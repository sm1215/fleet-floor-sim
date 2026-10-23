import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import type { Relation } from 'typeorm';
import { Floor } from './floor.entity.js';

@Entity('log_entry')
export class LogEntry {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar' })
  action: string;

  @Column({ type: 'varchar' })
  params: string;

  @Column({ type: 'varchar' })
  result: string;

  /** The floor's currentTick when the entry was written (timeline.md). */
  @Column({ type: 'integer' })
  tick: number;

  @ManyToOne(() => Floor)
  @JoinColumn({ name: 'floor_id' })
  floor: Relation<Floor>;
}
