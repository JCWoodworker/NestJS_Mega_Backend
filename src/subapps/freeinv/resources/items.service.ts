import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Items } from '../entities/item.entity';

import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

@Injectable()
export class ItemsService {
  constructor(
    @InjectRepository(Items)
    private readonly itemsRepository: Repository<Items>,
  ) {}
  async findAllItemsByUserid(userId: string) {
    return this.itemsRepository.find({ where: { userId: userId } });
  }

  async findAllByItemId(id: number) {
    return this.itemsRepository.find({
      where: { roomId: id },
    });
  }

  async create(body: any, userId: string) {
    const item = { ...body, userId };
    return await this.itemsRepository.save(item);
  }

  async imageUpload(file: Express.Multer.File, name: string) {
    const s3Client = new S3Client({
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY,
        secretAccessKey: process.env.AWS_SECRET_KEY,
      },
      region: process.env.AWS_REGION,
    });
    debugger;
    try {
      const params = {
        Bucket: process.env.AWS_S3_BUCKET,
        Key: name,
        Body: file.buffer,
      };
      debugger;
      const command = new PutObjectCommand(params);
      const data = await s3Client.send(command);
      debugger;
      console.log(data);
      return {
        message: 'Image uploaded successfully',
      };
    } catch (error) {
      console.error(`Image upload error: ${error}`);
      return {
        message: `Image upload error: ${error}`,
      };
    }
  }
}
