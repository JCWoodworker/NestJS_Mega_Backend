/*

MUCH TO DO:

This service was recently generated and many lines were commented out since they were 
unnecessary, BUT eventually will need editing.

* Business logic is not yet implemented, but their basic structure was generated

*/

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { BizlinksfreeUserSettings } from './entities/bizlinksfreeUserSettings.entity';
import { BizlinksfreeUrl } from './entities/bizlinksfreeUrl.entity';
import { CreateBizlinksfreeDto } from './dto/create-bizlinksfree.dto';
// import { UpdateBizlinksfreeDto } from './dto/update-bizlinksfree.dto';

@Injectable()
export class BizlinksfreeService {
  constructor(
    @InjectRepository(BizlinksfreeUserSettings)
    private readonly bizlinksfreeUserSettingsRepository: Repository<BizlinksfreeUserSettings>,

    @InjectRepository(BizlinksfreeUrl)
    private readonly bizlinksfreeUrlRepository: Repository<BizlinksfreeUrl>,
  ) {}
  create(createBizlinksfreeDto: CreateBizlinksfreeDto) {
    console.log(createBizlinksfreeDto);
    return 'This action adds a new bizlinksfree';
  }

  // findAll() {
  //   return `This action returns all bizlinksfree`;
  // }

  // findOne(id: number) {
  //   return `This action returns a #${id} bizlinksfree`;
  // }

  // update(id: number, updateBizlinksfreeDto: UpdateBizlinksfreeDto) {
  //   return `This action updates a #${id} bizlinksfree`;
  // }

  // remove(id: number) {
  //   return `This action removes a #${id} bizlinksfree`;
  // }
}
