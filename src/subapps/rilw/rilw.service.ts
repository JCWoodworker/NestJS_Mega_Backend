import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CreateRilwDto } from './dto/create-rilw.dto';
import { UpdateRilwDto } from './dto/update-rilw.dto';
import { S3Client, ListObjectsV2Command, _Object } from '@aws-sdk/client-s3';

@Injectable()
export class RilwService {
  private readonly s3Client: S3Client;

  constructor(private readonly configService: ConfigService) {
    const region = this.configService.get<string>('AWS_REGION_RILW');
    const accessKeyId = this.configService.get<string>('AWS_ACCESS_KEY_RILW');
    const secretAccessKey = this.configService.get<string>(
      'AWS_SECRET_KEY_RILW',
    );

    const credentials =
      accessKeyId && secretAccessKey
        ? { accessKeyId, secretAccessKey }
        : undefined;

    this.s3Client = new S3Client({
      ...(region ? { region } : {}),
      ...(credentials ? { credentials } : {}),
    });
  }

  private getBucketName(): string {
    const bucketName = this.configService.get<string>(
      'AWS_S3_BUCKET_NAME_RILW',
    );
    if (!bucketName) {
      throw new Error('AWS_S3_BUCKET_NAME_RILW is not configured');
    }
    return bucketName;
  }

  private getPublicBaseUrl(): string | null {
    const bucket = this.getBucketName();
    const region =
      this.configService.get<string>('AWS_REGION_RILW') || 'us-east-1';
    // Virtual-hosted–style URL; special case for us-east-1
    if (region === 'us-east-1') {
      return `https://${bucket}.s3.amazonaws.com`;
    }
    return `https://${bucket}.s3.${region}.amazonaws.com`;
  }

  private buildPublicUrl(key: string): string {
    const base = this.getPublicBaseUrl();
    return `${base}/${encodeURI(key)}`;
  }

  private async listAllKeysByPrefix(prefix: string): Promise<string[]> {
    const bucket = this.getBucketName();
    let continuationToken: string | undefined = undefined;
    const keys: string[] = [];
    do {
      const response = await this.s3Client.send(
        new ListObjectsV2Command({
          Bucket: bucket,
          Prefix: prefix,
          ContinuationToken: continuationToken,
        }),
      );
      (response.Contents || []).forEach((obj: _Object) => {
        if (obj.Key && !obj.Key.endsWith('/')) {
          keys.push(obj.Key);
        }
      });
      continuationToken = response.IsTruncated
        ? response.NextContinuationToken
        : undefined;
    } while (continuationToken);
    return keys;
  }

  async listWoodworkingPortfolio(): Promise<Record<string, string[]>> {
    const basePrefix = 'rilw-portfolio/woodworking/';
    const categories: Record<string, string> = {
      Coasters: 'coasters/',
      'Cutting & Serving Boards': 'cutting-serving-boards/',
      'Engraved & Embossed': 'engraved-embossed/',
      'Flights & Paddles': 'flightspaddles/',
      Misc: 'misc/',
      'Tables & Benches': 'tables-benches/',
      'Wall Art': 'wall-art/',
    };

    const isImage = (key: string) =>
      /\.(?:jpe?g|png|webp|gif|bmp|tiff?)$/i.test(key);
    const result: Record<string, string[]> = {};

    for (const [displayName, subdir] of Object.entries(categories)) {
      const fullPrefix = `${basePrefix}${subdir}`;
      const keys = await this.listAllKeysByPrefix(fullPrefix);
      const urls = keys.filter(isImage).map((key) => this.buildPublicUrl(key));
      result[displayName] = urls;
    }

    return result;
  }
  create(createRilwDto: CreateRilwDto) {
    return 'This action adds a new rilw';
  }

  findAll() {
    return `This action returns all rilw`;
  }

  findOne(id: number) {
    return `This action returns a #${id} rilw`;
  }

  update(id: number, updateRilwDto: UpdateRilwDto) {
    return `This action updates a #${id} rilw`;
  }

  remove(id: number) {
    return `This action removes a #${id} rilw`;
  }
}
