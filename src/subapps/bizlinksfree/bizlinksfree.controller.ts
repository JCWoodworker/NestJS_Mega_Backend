import { Controller, Get } from '@nestjs/common';
import { BizlinksfreeService } from './bizlinksfree.service';
// import { CreateBizlinksfreeDto } from './dto/create-bizlinksfree.dto';
// import { UpdateBizlinksfreeDto } from './dto/update-bizlinksfree.dto';
import { Auth } from 'src/iam/decorators/auth.decorator';
import { AuthType } from 'src/iam/enums/auth-type.enum';

@Controller('subapps/bizlinksfree')
export class BizlinksfreeController {
  constructor(private readonly bizlinksfreeService: BizlinksfreeService) {}

  // @Post()
  // create(@Body() createBizlinksfreeDto: CreateBizlinksfreeDto) {
  //   return this.bizlinksfreeService.create(createBizlinksfreeDto);
  // }
  @Auth(AuthType.None)
  @Get()
  async chillOut() {
    return { message: 'Chill out bro ... this is Biz Links FREE!!!' };
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
