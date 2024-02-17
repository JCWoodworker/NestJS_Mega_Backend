import { Entity, PrimaryGeneratedColumn, Column, OneToMany } from 'typeorm';
import { UserSubappAccess } from '../../subapps/resources/entities/userSubappAccess.entity';
import { Role } from '../enums/role.enum';
import { UUID } from 'crypto';

@Entity()
export class Users {
  @PrimaryGeneratedColumn('uuid')
  id: UUID;

  @OneToMany(
    () => UserSubappAccess,
    (userSubappAccess) => userSubappAccess.userId,
  )
  userSubappAccess: UserSubappAccess[];

  @Column({ unique: true })
  email: string;

  @Column({ nullable: true })
  password: string;

  @Column({ enum: Role, default: Role.Basic })
  role: Role;

  @Column({ nullable: true })
  googleId: string;

  @Column()
  created_at: Date;

  @Column()
  updated_at: Date;
}
