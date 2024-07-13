import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MycuttingboardLinks } from '../../entities/cbcLinks.entity';
@Injectable()
export class LinksService {
  constructor(
    @InjectRepository(MycuttingboardLinks)
    private readonly mycuttingboardLinksRepository: Repository<MycuttingboardLinks>,
  ) {}
  async getMessage() {
    return 'Hello from links service!';
  }
}
