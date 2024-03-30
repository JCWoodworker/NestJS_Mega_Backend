import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Req,
  Param,
} from '@nestjs/common';
import { LocationsService } from '../services/locations.service';
import { CreateInventoryElementDto } from '../../dto/create-inventory-element.dto';

@Controller('locations')
export class LocationsController {
  constructor(private readonly locationsService: LocationsService) {}

  @Get()
  findAllLocationsByUserId(@Req() request) {
    const userId = request.user.sub;
    return this.locationsService.findAllLocationsByUserId(userId);
  }

  @Post()
  async createLocation(
    @Body() body: CreateInventoryElementDto,
    @Req() request,
  ) {
    const userId = request.user.sub;
    return await this.locationsService.create(body, userId);
  }

  @Delete(':id')
  async deleteLocation(@Param('id') locationId: number, @Req() request) {
    const userId = request.user.sub;
    return await this.locationsService.delete(locationId, userId);
  }
}
