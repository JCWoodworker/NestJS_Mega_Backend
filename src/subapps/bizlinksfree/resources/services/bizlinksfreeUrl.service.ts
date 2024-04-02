/*

MUCH TO DO:

This service was recently generated and many lines were commented out since they were 
unnecessary, BUT eventually will need editing.

* Business logic is not yet implemented, but their basic structure was generated

*/

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { BizlinksfreeUrl } from '../../entities/bizlinksfreeUrl.entity';
// import { CreateBizlinksfreeUrlDto } from './dto/create-bizlinksfree-url.dto';
// import { UpdateBizlinksfreeUrlDto } from './dto/update-bizlinksfree-url.dto';

@Injectable()
export class BizlinksfreeUrlService {
  constructor(
    @InjectRepository(BizlinksfreeUrl)
    private readonly bizlinksfreeUrlRepository: Repository<BizlinksfreeUrl>,
  ) {}
  // create(createBizlinksfreeUserSettingsDto: CreateBizlinksfreeUserSettingsDto) {
  //   console.log(createBizlinksfreeUserSettingsDto);
  //   return 'This action adds a new bizlinksfree';
  // }

  // findAll() {
  //   return `This action returns all bizlinksfree`;
  // }

  // findOne(id: number) {
  //   return `This action returns a #${id} bizlinksfree`;
  // }

  // update(id: number, updateBizlinksfreeUserSettingsDto: UpdateBizlinksfreeUserSettingsDto) {
  //   return `This action updates a #${id} bizlinksfree`;
  // }

  // remove(id: number) {
  //   return `This action removes a #${id} bizlinksfree`;
  // }
}
