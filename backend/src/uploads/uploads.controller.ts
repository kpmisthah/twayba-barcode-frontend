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
import { CATALOG_WRITE, STOCK_WRITE } from '../auth/role-groups.js';
import { detectImageType, MAX_IMAGE_BYTES, uploadDir } from './upload-dir.js';

const imageUpload = FileInterceptor('file', { limits: { fileSize: MAX_IMAGE_BYTES, files: 1 } });

@Controller('uploads')
export class UploadsController {
  /** Upload one product image (JPG, PNG or WebP, max 5 MB). Returns its URL path. */
  @Roles(...CATALOG_WRITE)
  @Post('products')
  @UseInterceptors(imageUpload)
  uploadProductImage(@UploadedFile() file?: Express.Multer.File) {
    return saveImage('products', file);
  }

  /** Photo of a delivery, a damaged box or a failed drop-off, taken by the driver. */
  @Roles(...STOCK_WRITE)
  @Post('deliveries')
  @UseInterceptors(imageUpload)
  uploadDeliveryPhoto(@UploadedFile() file?: Express.Multer.File) {
    return saveImage('deliveries', file);
  }
}

/** Saves under a random name (the content decides the type, not the file name). */
async function saveImage(folder: 'products' | 'deliveries', file?: Express.Multer.File) {
  if (!file) throw new BadRequestException('Choose an image file');
  const ext = detectImageType(file.buffer);
  if (!ext) throw new BadRequestException('Only JPG, PNG or WebP images are allowed');
  const dir = join(uploadDir(), folder);
  await mkdir(dir, { recursive: true });
  const name = `${randomUUID()}.${ext}`;
  await writeFile(join(dir, name), file.buffer);
  return { url: `/uploads/${folder}/${name}` };
}
