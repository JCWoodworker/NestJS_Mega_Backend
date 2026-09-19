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

  /** When true, sign-in / Google / refresh are rejected (admin lock). */
  @Column({ name: 'is_locked', default: false })
  isLocked: boolean;

  /**
   * Soft gate only — nothing currently checks this to block sign-in. It
   * exists so the frontend can nudge an unverified user rather than pretend
   * every address on file was ever proven deliverable. Google-created
   * accounts are stamped true at creation (Google already verified the
   * address); password accounts start false and flip true via the emailed
   * link. Pre-existing rows were backfilled to true by migration
   * 1788950000000, since verification shipped after they had already signed
   * up.
   */
  @Column({ name: 'is_email_verified', default: false })
  isEmailVerified: boolean;

  /** Stamped on password and Google sign-in, not on token refresh. */
  @Column({ name: 'last_login_at', type: 'timestamptz', nullable: true })
  lastLoginAt: Date | null;

  /**
   * Product / subapp slugs this account has signed up or signed in through
   * (e.g. `strikedesk`, `mycuttingboard`). Empty until an app stamps one.
   * Strikedesk admin Users filters to rows containing `strikedesk`.
   */
  @Column({
    name: 'signup_sources',
    type: 'text',
    array: true,
    default: '{}',
  })
  signupSources: string[];

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
