import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Locations } from '../entities/location.entity';

@Injectable()
export class LocationsService {
  constructor(
    @InjectRepository(Locations)
    private readonly locationsRepository: Repository<Locations>,
  ) {}
  findAll() {
    const locationList = this.locationsRepository.find();
    return locationList;
  }

  create(body: any) {
    const location = body;
    return this.locationsRepository.save(location);
  }
}
