import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('floor')
export class Floor {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'integer' })
  height: number;

  @Column({ type: 'integer' })
  width: number;
}
