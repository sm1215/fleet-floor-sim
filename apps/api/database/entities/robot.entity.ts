import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import type { Relation } from 'typeorm';
import { Cell } from './cell.entity.js';

@Entity('robot')
export class Robot {
  @PrimaryGeneratedColumn()
  id: number;

  /** Shown as `R<displayId>`; separate from the primary key. Unique per floor (Engine). */
  @Column({ name: 'display_id', type: 'integer' })
  displayId: number;

  @Column({ type: 'integer' })
  direction: number;

  @ManyToOne(() => Cell)
  @JoinColumn({ name: 'cell_id' })
  cell: Relation<Cell>;
}
