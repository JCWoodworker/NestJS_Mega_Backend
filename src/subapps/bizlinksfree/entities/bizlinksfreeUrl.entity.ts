import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity()
export class BizlinksfreeUrl {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({
    unique: true,
    nullable: false,
  })
  user_id: string;

  @Column()
  url: string;

  @Column()
  display_name: string;

  @Column()
  created_at: Date;

  @Column()
  updated_at: Date;
}
