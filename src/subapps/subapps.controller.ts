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
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';

import { Role } from '@users/enums/role.enum';

import { Roles } from '@iam/authorization/decorators/roles.decorator';
import { Auth } from '@iam/decorators/auth.decorator';
import { AuthType } from '@iam/enums/auth-type.enum';

import { SubappsService } from '@subapps/subapps.service';

@Auth(AuthType.Bearer)
@Controller()
export class SubappsController {
  constructor(private readonly subappsService: SubappsService) {}

  // S3 BUCKET UPLOAD
  // TODO: Add logic to handle sending a subapp name to the backend
  // This will help us direct images to the proper bucket

  @Roles(Role.Admin)
  @Post('image-upload')
  @UseInterceptors(FileInterceptor('image'))
  async imageUpload(@UploadedFile() file: Express.Multer.File) {
    return await this.subappsService.imageUpload(file);
  }
}
