import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Items } from '../entities/item.entity';

import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

interface ImageSubmissionBody {
  inventoryId: string;
  inventoryType: string;
}

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

  // imageUpload() NEEDS to be extracted into it's own controller and service!!
  // This should probably even be moved out of subapps/freeinv and be able to be used
  // across all subapps.

  async imageUpload(file: Express.Multer.File, body: ImageSubmissionBody) {
    // Console logging the request body for now.
    // This eventually needs to be validated and used to update the row in the database
    // that pertains to the specific location, room, or item's image being uploaded
    console.log(`Image Upload Request Body: ${JSON.stringify(body)}`);

    const s3Bucket = process.env.AWS_S3_BUCKET_NAME;
    const s3Client = new S3Client({
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY,
        secretAccessKey: process.env.AWS_SECRET_KEY,
      },
      region: process.env.AWS_REGION,
    });
    try {
      const params = {
        Bucket: s3Bucket,
        Key: file.originalname,
        Body: file.buffer,
      };
      const command = new PutObjectCommand(params);
      await s3Client.send(command);

      return {
        message: 'Image uploaded successfully',
        publicUrl: `https://${s3Bucket}.s3.amazonaws.com/${file.originalname}`,
      };
    } catch (error) {
      console.error(`Image upload error: ${error}`);
      return {
        message: `Image upload error: ${error}`,
      };
    }
  }
}
