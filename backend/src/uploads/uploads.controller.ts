import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  BadRequestException,
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { CATALOG_WRITE } from '../auth/role-groups.js';
import { detectImageType, MAX_IMAGE_BYTES, uploadDir } from './upload-dir.js';

@Controller('uploads')
export class UploadsController {
  /** Upload one product image (JPG, PNG or WebP, max 5 MB). Returns its URL path. */
  @Roles(...CATALOG_WRITE)
  @Post('products')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_IMAGE_BYTES, files: 1 } }))
  async uploadProductImage(@UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('Choose an image file');
    const ext = detectImageType(file.buffer);
    if (!ext) throw new BadRequestException('Only JPG, PNG or WebP images are allowed');

    const dir = join(uploadDir(), 'products');
    await mkdir(dir, { recursive: true });
    const name = `${randomUUID()}.${ext}`;
    await writeFile(join(dir, name), file.buffer);
    return { url: `/uploads/products/${name}` };
  }
}
