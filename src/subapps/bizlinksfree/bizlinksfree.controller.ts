import { Controller, Get } from '@nestjs/common';
import { BizlinksfreeService } from './bizlinksfree.service';
// import { CreateBizlinksfreeDto } from './dto/create-bizlinksfree.dto';
// import { UpdateBizlinksfreeDto } from './dto/update-bizlinksfree.dto';

@Controller('bizlinksfree')
export class BizlinksfreeController {
  constructor(private readonly bizlinksfreeService: BizlinksfreeService) {}

  // @Post()
  // create(@Body() createBizlinksfreeDto: CreateBizlinksfreeDto) {
  //   return this.bizlinksfreeService.create(createBizlinksfreeDto);
  // }

  @Get()
  async chillOut() {
    return { message: 'Chill the fuck out bro!' };
  }
  // findAll() {
  //   return this.bizlinksfreeService.findAll();
  // }

  // @Get(':id')
  // findOne(@Param('id') id: string) {
  //   return this.bizlinksfreeService.findOne(+id);
  // }

  // @Patch(':id')
  // update(@Param('id') id: string, @Body() updateBizlinksfreeDto: UpdateBizlinksfreeDto) {
  //   return this.bizlinksfreeService.update(+id, updateBizlinksfreeDto);
  // }

  // @Delete(':id')
  // remove(@Param('id') id: string) {
  //   return this.bizlinksfreeService.remove(+id);
  // }
}
