import { Injectable } from '@nestjs/common';
import { CreateMyrestaurantlinkDto } from './dto/create-myrestaurantlink.dto';
import { UpdateMyrestaurantlinkDto } from './dto/update-myrestaurantlink.dto';

@Injectable()
export class MyrestaurantlinksService {
  create(createMyrestaurantlinkDto: CreateMyrestaurantlinkDto) {
    return 'This action adds a new myrestaurantlink';
  }

  findAll() {
    return `This action returns all myrestaurantlinks`;
  }

  findOne(id: number) {
    return `This action returns a #${id} myrestaurantlink`;
  }

  update(id: number, updateMyrestaurantlinkDto: UpdateMyrestaurantlinkDto) {
    return `This action updates a #${id} myrestaurantlink`;
  }

  remove(id: number) {
    return `This action removes a #${id} myrestaurantlink`;
  }
}
