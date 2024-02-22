/*

MUCH TO DO:

This controller was recently generated and many lines were commented out since they were 
unnecessary, BUT eventually will need editing.

* DTO's are not yet implemented, but their basic structure was generated
* Endpoits were not yet implemented either, but their basic structure was generated

*/

import { Controller, Get } from '@nestjs/common';
import { BizlinksfreeUserSettingsService } from './services/bizlinksfreeUserSettings.service';
import { BizlinksfreeUrlService } from './services/bizlinksfreeUrl.service';
// import { CreateBizlinksfreeDto } from './dto/create-bizlinksfree.dto';
// import { UpdateBizlinksfreeDto } from './dto/update-bizlinksfree.dto';
import { Auth } from 'src/iam/decorators/auth.decorator';
import { AuthType } from 'src/iam/enums/auth-type.enum';
// import { Role } from 'src/users/enums/role.enum';
// import { Roles } from 'src/iam/authorization/decorators/roles.decorator';

@Controller()
export class BizlinksfreeController {
  constructor(
    private readonly bizlinksfreeService: BizlinksfreeUserSettingsService,
    private readonly bizlinksfreeUrlService: BizlinksfreeUrlService,
  ) {}

  // @Post()
  // create(@Body() createBizlinksfreeDto: CreateBizlinksfreeDto) {
  //   return this.bizlinksfreeService.create(createBizlinksfreeDto);
  // }

  // @Roles(Role.Admin, Role.Basic)

  @Auth(AuthType.None)
  @Get()
  chillOut() {
    return { message: 'Chill out bro ... Biz Links is FREE!!!' };
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
