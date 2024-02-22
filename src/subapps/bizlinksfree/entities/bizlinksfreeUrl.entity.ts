import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity()
export class BizlinksfreeUrl {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  userId: string;

  @Column()
  url: string;

  @Column()
  created_at: Date;

  @Column()
  updated_at: Date;
}
