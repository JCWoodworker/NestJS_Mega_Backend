import {
  Controller,
  Get,
  Post,
  Body,
  Delete,
  Param,
  Req,
} from '@nestjs/common';
import { LinksService } from '../services/links.service';

@Controller('links')
export class LinksController {
  constructor(private readonly linksService: LinksService) {}

  @Get('')
  async getUserLinks(@Req() request: any) {
    return await this.linksService.getUserLinks(request.user.sub);
  }

  @Post('')
  async addNewLink(@Req() request: any, @Body() body: any) {
    return await this.linksService.addNewLink({
      ...body,
      user_id: request.user.sub,
    });
  }

  @Delete(':id')
  async deleteLink(@Param('id') id: number) {
    return await this.linksService.deleteLink(id);
  }

  @Post(':id')
  async updateLink(@Param('id') id: number, @Body() body: any) {
    return await this.linksService.updateLink(id, body);
  }
}
