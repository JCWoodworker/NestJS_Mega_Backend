import { PrimaryGeneratedColumn, Column, Entity } from 'typeorm';

@Entity()
export class BizlinksfreeUserSettings {
  @PrimaryGeneratedColumn()
  id: string;

  @Column({
    unique: true,
    nullable: false,
  })
  user_id: string;

  @Column()
  display_name: string;

  @Column()
  business_name: string;

  @Column()
  color_scheme: string;

  @Column()
  logo_url: string;

  @Column()
  facebook_url: string;

  @Column()
  twitter_url: string;

  @Column()
  instagram_url: string;

  @Column()
  linkedin_url: string;

  @Column()
  youtube_url: string;

  @Column()
  github_url: string;

  @Column()
  created_at: Date;

  @Column()
  updated_at: Date;
}
