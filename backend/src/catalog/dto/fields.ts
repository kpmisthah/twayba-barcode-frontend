import { applyDecorators } from '@nestjs/common';
import { IsNumber, IsOptional, IsString, Matches, MaxLength, Min } from 'class-validator';

/** Letters, digits and - _ . / — what label printers and scanners handle reliably. */
export const SKU_PATTERN = /^[A-Za-z0-9][A-Za-z0-9\-_./]{0,63}$/;
/** Printable ASCII without spaces, 3–64 chars (EAN, UPC, Code 128 contents). */
export const BARCODE_PATTERN = /^[\x21-\x7E]{3,64}$/;

export const IsSku = () =>
  applyDecorators(
    IsOptional(),
    IsString(),
    Matches(SKU_PATTERN, { message: 'SKU may only contain letters, numbers and - _ . / (max 64)' }),
  );

export const IsBarcodeCode = () =>
  applyDecorators(
    IsString(),
    Matches(BARCODE_PATTERN, { message: 'Barcode must be 3–64 characters with no spaces' }),
  );

export const IsMoney = () => applyDecorators(IsNumber({ maxDecimalPlaces: 2 }), Min(0));

export const IsShortText = (max = 60) => applyDecorators(IsOptional(), IsString(), MaxLength(max));
