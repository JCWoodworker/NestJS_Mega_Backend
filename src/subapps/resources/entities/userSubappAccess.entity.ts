import { Entity, PrimaryGeneratedColumn, Column, ManyToOne } from 'typeorm';
import { Users } from 'src/users/entities/users.entity';

@Entity()
export class UserSubappAccess {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Users, (user) => user.id)
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
