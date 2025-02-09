import {
  Controller,
  Get,
  // Post,
  // Body,
  // Patch,
  Param,
  // Delete,
} from '@nestjs/common';
// import { CreateGeminiDto } from './dto/create-gemini.dto';
// import { UpdateGeminiDto } from './dto/update-gemini.dto';

import { GeminiService } from './gemini.service';

// import { Roles } from 'src/iam/authorization/decorators/roles.decorator';
// import { Role } from 'src/users/enums/role.enum';
import { AuthType } from 'src/iam/enums/auth-type.enum';
import { Auth } from 'src/iam/decorators/auth.decorator';

@Auth(AuthType.None)
@Controller()
export class GeminiController {
  constructor(private readonly geminiService: GeminiService) {}

  // @Post()
  // create(@Body() createGeminiDto: CreateGeminiDto) {
  //   return this.geminiService.create(createGeminiDto);
  // }

  @Get()
  async findAll() {
    return this.geminiService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.geminiService.findOne(+id);
  }

  // @Patch(':id')
  // update(@Param('id') id: string, @Body() updateGeminiDto: UpdateGeminiDto) {
  //   return this.geminiService.update(+id, updateGeminiDto);
  // }

  // @Delete(':id')
  // remove(@Param('id') id: string) {
  //   return this.geminiService.remove(+id);
  // }
}
