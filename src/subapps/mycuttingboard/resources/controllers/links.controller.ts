import { Controller } from '@nestjs/common';
import { LinksService } from '../services/links.service';

@Controller('links')
export class LinksController {
  constructor(private readonly linksService: LinksService) {}
}
