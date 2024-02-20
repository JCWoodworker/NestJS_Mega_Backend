import { Injectable } from '@nestjs/common';
import { CreateBizlinksfreeDto } from './dto/create-bizlinksfree.dto';
// import { UpdateBizlinksfreeDto } from './dto/update-bizlinksfree.dto';

@Injectable()
export class BizlinksfreeService {
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
