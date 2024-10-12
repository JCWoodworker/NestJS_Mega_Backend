import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MrlRestaurants } from './entities/mrlRestaurants.entity';
// import { CreateMyrestaurantlinkDto } from './dto/create-myrestaurantlink.dto';
// import { UpdateMyrestaurantlinkDto } from './dto/update-myrestaurantlink.dto';

@Injectable()
export class MyrestaurantlinksService {
  constructor(
    @InjectRepository(MrlRestaurants)
    private readonly restaurantsRepository: Repository<MrlRestaurants>,
  ) {}
  // create(createMyrestaurantlinkDto: CreateMyrestaurantlinkDto) {
  //   return 'This action adds a new myrestaurantlink';
  // }

  // findAll() {
  //   return `This action returns all myrestaurantlinks`;
  // }

  findOne(incomingDomain: string) {
    return this.restaurantsRepository.findOne({
      where: {
        domain: incomingDomain,
      },
    });
  }

  // update(id: number, updateMyrestaurantlinkDto: UpdateMyrestaurantlinkDto) {
  //   return `This action updates a #${id} myrestaurantlink`;
  // }

  // remove(id: number) {
  //   return `This action removes a #${id} myrestaurantlink`;
  // }
}
