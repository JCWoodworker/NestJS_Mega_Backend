import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity()
export class UserSubappAccess {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  userId: string;

  @Column()
  appId: string;

  @Column()
  subscription_tier: string;

  @Column()
  access_level: string;

  @Column()
  created_at: Date;

  @Column()
  updated_at: Date;
}
