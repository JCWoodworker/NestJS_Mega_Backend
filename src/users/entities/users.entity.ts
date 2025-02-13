import { Entity, PrimaryGeneratedColumn, Column, OneToMany } from 'typeorm';
import { Role } from '@users/enums/role.enum';
import { OblUsersAndBusinesses } from '@onlybizlinks/entities/oblUsersAndBusinesses.entity';

@Entity()
export class Users {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  email: string;

  @Column({ nullable: true })
  password: string;

  @Column({ enum: Role, default: Role.Basic })
  role: Role;

  @Column({ nullable: true })
  googleId: string;

  @Column({ nullable: true })
  first_name: string;

  @Column({ nullable: true })
  last_name: string;

  @Column({ nullable: true })
  image_url: string;

  @Column()
  created_at: Date;

  @Column()
  updated_at: Date;

  @OneToMany(
    () => OblUsersAndBusinesses,
    (usersAndBusinesses) => usersAndBusinesses.user,
  )
  usersAndBusinesses: OblUsersAndBusinesses[];
}
