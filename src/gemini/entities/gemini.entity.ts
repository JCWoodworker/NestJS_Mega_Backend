import { PrimaryGeneratedColumn, Column } from 'typeorm';

export class Gemini {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  prompt: string;

  @Column()
  response: string;
}
