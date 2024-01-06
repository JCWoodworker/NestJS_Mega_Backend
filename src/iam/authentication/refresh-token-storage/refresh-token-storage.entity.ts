import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity()
export class RefreshTokens {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  userId: string;

  @Column()
  tokenId: string;
}
