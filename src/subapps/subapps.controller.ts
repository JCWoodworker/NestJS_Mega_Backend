import { Controller, Get } from '@nestjs/common';
import { SubappsService } from './subapps.service';
import { Auth } from 'src/iam/decorators/auth.decorator';
import { AuthType } from 'src/iam/enums/auth-type.enum';

@Auth(AuthType.None)
@Controller('subapps')
export class SubappsController {
  constructor(private readonly subappsService: SubappsService) {}

  @Get()
  getMessage(): string {
    return 'fuck you';
  }
}
