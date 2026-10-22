import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import type { Relation } from 'typeorm';
import { Robot } from './robot.entity.js';

@Entity('queued_command')
export class QueuedCommand {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar' })
  command: string;

  @Column({ type: 'varchar', nullable: true })
  params: string | null;

  @ManyToOne(() => Robot)
  @JoinColumn({ name: 'robot_id' })
  robot: Relation<Robot>;
}
