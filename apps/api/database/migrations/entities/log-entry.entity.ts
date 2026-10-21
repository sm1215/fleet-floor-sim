import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

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
}
