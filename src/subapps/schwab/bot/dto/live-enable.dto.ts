import { Equals } from 'class-validator';

export class LiveEnableDto {
  @Equals(true, { message: 'confirm must be true to arm BOT_LIVE' })
  confirm: true;
}
