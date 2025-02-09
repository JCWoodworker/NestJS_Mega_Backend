import { Injectable } from '@nestjs/common';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

@Injectable()
export class SubappsService {
  constructor() {}

  async imageUpload(file: Express.Multer.File) {
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
      const successfulImageUpload = await s3Client.send(command);
      if (successfulImageUpload.$metadata.httpStatusCode !== 200) {
        throw new Error();
      } else {
        console.log(`Image upload successful`);
        return {
          message: 'Image uploaded successfully',
          publicUrl: `https://${s3Bucket}.s3.amazonaws.com/${file.originalname}`,
        };
      }
    } catch (error) {
      console.error(`Image upload error: ${error}`);
      return {
        message: `Image upload error: ${error}`,
      };
    }
  }
}
