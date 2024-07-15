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

  async getUserLinks(userId) {
    return await this.mycuttingboardLinksRepository.find({
      where: { user_id: userId },
    });
  }

  async addNewLink(newLinkData: CbcLinks) {
    return await this.mycuttingboardLinksRepository.save(newLinkData);
  }

  async deleteLink(id: number, userId: string) {
    const link = await this.mycuttingboardLinksRepository.findOneBy({ id });
    if (userId !== link.user_id) {
      return { error: "You don't have permission to delete this link" };
    }

    return await this.mycuttingboardLinksRepository.delete(id);
  }

  async updateLink(id: number, linkUpdateData: CbcLinks) {
    const link = await this.mycuttingboardLinksRepository.findOneBy({ id });
    if (!link) {
      return { error: 'Link not found' };
    }

    if (link.user_id !== linkUpdateData.user_id) {
      return { error: "You don't have permission to update this link" };
    }

    return await this.mycuttingboardLinksRepository.save({
      ...link,
      ...linkUpdateData,
    });
  }
}
