import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity()
export class Users {
  @PrimaryGeneratedColumn()
  userId: number;

  @Column({ unique: true })
  username: string;

  @Column({ unique: true })
  email: string;

  @Column()
  password: string;

  @Column({ default: 'basic' })
  userType: string;

  @Column({ default: null })
  refreshToken: string;

  @Column({ default: null })
  cellphone: string;

  // The following two columns need to really be in their own table
  // with a one-to-one relationship per user

  @Column({ default: null })
  passwordResetToken: string;

  @Column({ default: null })
  passwordResetJwt: string;
}
