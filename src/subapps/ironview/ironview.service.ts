import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { UUID } from 'crypto';
import { Repository } from 'typeorm';

import { Building } from './entities/building.entity';

@Injectable()
export class IronviewService {
  constructor(
    @InjectRepository(Building)
    private buildingRepository: Repository<Building>,
  ) {}
  // create(ironview) {
  //   return `This action adds a new ironview - ${ironview}`;
  // }
  async findAll() {
    return await this.buildingRepository.find({
      relations: [
        'floors',
        'floors.areas',
        'floors.areas.rooms',
        'floors.areas.rooms.walls',
        'floors.areas.rooms.walls.images',
      ],
    });
  }
  async findOne(id: UUID) {
    const building = await this.buildingRepository.findOne({
      where: {
        id,
      },
      relations: [
        'floors',
        'floors.areas',
        'floors.areas.rooms',
        'floors.areas.rooms.walls',
        'floors.areas.rooms.walls.images',
      ],
    });
    return building;
  }
  // update(id: number, updateIronview) {
  //   return `This action updates a #${id} ironview - ${updateIronview}`;
  // }
  // remove(id: number) {
  //   return `This action removes a #${id} ironview`;
  // }
}
