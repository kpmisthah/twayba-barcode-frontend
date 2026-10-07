import { resolve } from 'node:path';

/** Where uploaded files are stored on disk. Served publicly at /uploads/. */
export function uploadDir(): string {
  return resolve(process.env.UPLOAD_DIR ?? 'uploads');
}

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/** Detect the image type from the file's first bytes, not its name or claimed type. */
export function detectImageType(buf: Buffer): 'jpg' | 'png' | 'webp' | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  return null;
}
