import { Controller, Get, Param } from '@nestjs/common';
import { MyrestaurantlinksService } from './myrestaurantlinks.service';
// import { CreateMyrestaurantlinkDto } from './dto/create-myrestaurantlink.dto';
// import { UpdateMyrestaurantlinkDto } from './dto/update-myrestaurantlink.dto';

import { Auth } from 'src/iam/decorators/auth.decorator';
import { AuthType } from 'src/iam/enums/auth-type.enum';

@Controller('')
export class MyrestaurantlinksController {
  constructor(
    private readonly myrestaurantlinksService: MyrestaurantlinksService,
  ) {}

  @Auth(AuthType.None)
  @Get(':incomingDomain')
  findOne(@Param('incomingDomain') incomingDomain: string) {
    return this.myrestaurantlinksService.findOne(incomingDomain);
  }

  // @Post()
  // create(@Body() createMyrestaurantlinkDto: CreateMyrestaurantlinkDto) {
  //   return this.myrestaurantlinksService.create(createMyrestaurantlinkDto);
  // }

  // @Patch(':id')
  // update(
  //   @Param('id') id: string,
  //   @Body() updateMyrestaurantlinkDto: UpdateMyrestaurantlinkDto,
  // ) {
  //   return this.myrestaurantlinksService.update(+id, updateMyrestaurantlinkDto);
  // }

  // @Delete(':id')
  // remove(@Param('id') id: string) {
  //   return this.myrestaurantlinksService.remove(+id);
  // }
}
