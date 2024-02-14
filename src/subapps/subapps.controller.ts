import { Controller } from '@nestjs/common';
import { SubappsService } from './subapps.service';

@Controller('subapps')
export class SubappsController {
  constructor(private readonly subappsService: SubappsService) {}
}
