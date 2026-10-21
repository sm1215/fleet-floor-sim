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

@Entity('cell')
@Unique(['floor', 'xPosition', 'yPosition'])
export class Cell {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'boolean' })
  obstacle: boolean;

  @Column({ name: 'x_position', type: 'integer' })
  xPosition: number;

  @Column({ name: 'y_position', type: 'integer' })
  yPosition: number;

  @ManyToOne(() => Floor)
  @JoinColumn({ name: 'floor_id' })
  floor: Relation<Floor>;
}
