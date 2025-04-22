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

  async findAll() {
    return await this.buildingRepository.find({});
  }

  async findOneBuilding(id: UUID) {
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

  // createBuilding(building) {
  //   return `This action adds a new building - ${building}`;
  // }

  // updateBuilding(id: number, updateBuilding) {
  //   return `This action updates a #${id} building - ${updateBuilding}`;
  // }

  // removeBuilding(id: number) {
  //   return `This action removes a #${id} building`;
  // }
}
