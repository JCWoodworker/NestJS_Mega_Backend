/*

The controller path of 'subapps' is actually declared in app.module.ts
All child controllers under this one are also declared in app.module.ts

Why??  So we don't have to add /subapps to all subapp controllers AND we don't
even have to give each main subapp controller a path prefix in the controller itself

Read the NestJS "RouterModule" docs - https://docs.nestjs.com/recipes/router-module

*/

import {
  Controller,
  Post,
  Body,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { SubappsService } from './subapps.service';
import { Auth } from 'src/iam/decorators/auth.decorator';
import { AuthType } from 'src/iam/enums/auth-type.enum';
import { FileInterceptor } from '@nestjs/platform-express';

@Auth(AuthType.Bearer)
@Controller()
export class SubappsController {
  constructor(private readonly subappsService: SubappsService) {}

  // S3 BUCKET UPLOAD
  // This needs to be moved up to the general subapps controller/service
  @Post('image-upload')
  @UseInterceptors(FileInterceptor('image'))
  async imageUpload(@UploadedFile() file: Express.Multer.File, @Body() body) {
    return await this.subappsService.imageUpload(file, body);
  }
}
