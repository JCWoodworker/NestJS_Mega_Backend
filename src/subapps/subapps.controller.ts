import {
  Controller,
  Get,
  Post,
  Body,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { SubappsService } from './subapps.service';
import { Auth } from 'src/iam/decorators/auth.decorator';
import { AuthType } from 'src/iam/enums/auth-type.enum';
import { FileInterceptor } from '@nestjs/platform-express';
@Auth(AuthType.None)
@Controller('subapps')
export class SubappsController {
  constructor(private readonly subappsService: SubappsService) {}

  @Get()
  getMessage(): string {
    return 'fuck you';
  }

  // S3 BUCKET UPLOAD
  // This needs to be moved up to the general subapps controller/service
  @Post('image-upload')
  @UseInterceptors(FileInterceptor('image'))
  async imageUpload(@UploadedFile() file: Express.Multer.File, @Body() body) {
    return await this.subappsService.imageUpload(file, body);
  }
}
