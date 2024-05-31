import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { MycuttingboardCoasters } from '../../entities/mycuttingboardCoasters.entity';
@Injectable()
export class CoastersService {
  constructor(
    @InjectRepository(MycuttingboardCoasters)
    private coastersRepository: Repository<MycuttingboardCoasters>,
  ) {}

  async getCoasterDataById(id: number) {
    const coaster = await this.coastersRepository.findOne({ where: { id } });
    if (!coaster) {
      throw new HttpException('Coaster not found', HttpStatus.NOT_FOUND);
    }
    return coaster;
  }

  async addCoasterData(coasterData: MycuttingboardCoasters) {
    return await this.coastersRepository.save(coasterData);
  }

  async deleteCoasterData(id: number) {
    return await this.coastersRepository.delete({ id });
  }

  // This needs a proper DTO before implementation
  // async updateCoasterData(id: number, body: MycuttingboardCoasters) {
  //   return await this.coastersRepository.update(id, body);
  // }
}
