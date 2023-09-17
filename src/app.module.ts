import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { RoomModule } from './room/room.module';
import { TagModule } from './tag/tag.module';
import { UserModule } from './user/user.module';
import { AuthModule } from './auth/auth.module';
import { ItemModule } from './item/item.module';

@Module({
  imports: [RoomModule, TagModule, UserModule, AuthModule, ItemModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
