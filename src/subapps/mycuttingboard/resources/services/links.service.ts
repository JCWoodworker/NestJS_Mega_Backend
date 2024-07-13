import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CbcLinks } from '../../entities/cbcLinks.entity';
@Injectable()
export class LinksService {
  constructor(
    @InjectRepository(CbcLinks)
    private readonly mycuttingboardLinksRepository: Repository<CbcLinks>,
  ) {}
  async getMessage() {
    return 'Hello from links service!';
  }
}
