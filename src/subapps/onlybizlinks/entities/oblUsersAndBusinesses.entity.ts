import {
  Entity,
  PrimaryGeneratedColumn,
  JoinColumn,
  ManyToOne,
  Column,
} from 'typeorm';
import { OblBusinesses } from './oblBusinesses.entity';
import { Users } from 'src/users/entities/users.entity';

@Entity()
export class OblUsersAndBusinesses {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  business_id: number;

  @Column()
  user_id: string;

  @ManyToOne(() => OblBusinesses, (business) => business.usersAndBusinesses)
  @JoinColumn({ name: 'business_id' })
  business: OblBusinesses;

  @ManyToOne(() => Users, (user) => user.usersAndBusinesses)
  @JoinColumn({ name: 'user_id' })
  user: Users;
}
