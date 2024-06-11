import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { CbcProduct } from '../../entities/cbcProducts.entity';
import { UpdateProductDto } from '../../dto/update-product.dto';
import { CreateProductDto } from '../../dto/create-product.dto';

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(CbcProduct)
    private productRepository: Repository<CbcProduct>,
  ) {}

  async getAllProductData() {
    return await this.productRepository.find();
  }

  async addNewProduct(newProduct) {
    try {
      await this.productRepository.save(newProduct);
      return { message: 'Product added successfully', product: newProduct };
    } catch (error) {
      return false;
    }
  }

  async updateProduct(id: number, productUpdateData: UpdateProductDto) {
    const product = await this.productRepository.findOneBy({ id });
    return await this.productRepository.save({
      ...product,
      ...productUpdateData,
    });
  }

  async deleteProduct(id: number) {
    try {
      const product = await this.productRepository.findOneBy({ id });
      if (!product) {
        return { message: `Product with id ${id} not found` };
      }
      await this.productRepository.delete({ id });
      return { message: `Successfully deleted - ${product.title}` };
    } catch (error) {
      return { message: `Failed to delete - ${error}` };
    }
  }

  async addNewProductWithImage(
    file: Express.Multer.File,
    parsedNewProduct: CreateProductDto,
  ) {
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
      }
      await this.productRepository.save({
        ...parsedNewProduct,
        image_url: `https://${s3Bucket}.s3.amazonaws.com/${file.originalname}`,
      });
      return {
        message: 'Product saved successfully',
        product: parsedNewProduct,
      };
    } catch (error) {
      return {
        message: `Image upload error: ${error}`,
      };
    }
  }
}
