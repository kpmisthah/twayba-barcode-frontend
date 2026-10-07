import { detectImageType } from './upload-dir.js';

const pad = (bytes: number[]) => Buffer.concat([Buffer.from(bytes), Buffer.alloc(16)]);

describe('detectImageType', () => {
  it('recognises JPG, PNG and WebP by content', () => {
    expect(detectImageType(pad([0xff, 0xd8, 0xff, 0xe0]))).toBe('jpg');
    expect(detectImageType(pad([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe('png');
    expect(detectImageType(Buffer.from('RIFF\0\0\0\0WEBPVP8 '))).toBe('webp');
  });

  it('rejects other files, even if renamed', () => {
    expect(detectImageType(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'))).toBeNull();
    expect(detectImageType(Buffer.from('%PDF-1.7 ......'))).toBeNull();
    expect(detectImageType(Buffer.from('tiny'))).toBeNull();
  });
});
