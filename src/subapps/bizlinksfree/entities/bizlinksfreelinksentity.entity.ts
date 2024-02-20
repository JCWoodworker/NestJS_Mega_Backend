import { PrimaryGeneratedColumn, Column } from 'typeorm';

export class BizLinksFreeUrlLinks {
  @PrimaryGeneratedColumn()
  id: string;

  @Column()
  userId: string;

  @Column()
  link: string;
}
