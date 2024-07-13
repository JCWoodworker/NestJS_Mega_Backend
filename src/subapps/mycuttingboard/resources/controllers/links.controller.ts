import { Controller, Get, Req } from '@nestjs/common';
import { LinksService } from '../services/links.service';

@Controller('links')
export class LinksController {
  constructor(private readonly linksService: LinksService) {}

  @Get('')
  async getUserLinks(@Req() request: any) {
    debugger;
    return await this.linksService.getUserLinks(request.user.sub);
  }
}
