import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  // ManyToOne,
  // JoinColumn,
} from 'typeorm';
// import { Users } from 'src/users/entities/users.entity';

@Entity()
export class UserSubappAccess {
  @PrimaryGeneratedColumn()
  id: number;

  // @ManyToOne(() => Users, (user) => user.id)
  // @JoinColumn({ name: 'userId' })
  @Column()
  userId: string;

  @Column()
  subappId: string;

  @Column()
  subscription_tier: string;

  @Column()
  access_level: string;

  @Column()
  created_at: Date;

  @Column()
  updated_at: Date;
}
