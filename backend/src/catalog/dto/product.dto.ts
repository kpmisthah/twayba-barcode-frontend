import { ProductStatus, ProductType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { IsBarcodeCode, IsMoney, IsShortText, IsSku } from './fields.js';

const IMAGE_URL = /^\/uploads\/products\/[a-f0-9-]{36}\.(jpg|png|webp)$/;

class ProductInfoDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsShortText(80)
  brand?: string;

  @IsOptional()
  @IsUUID()
  taxRateId?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100000)
  minStock?: number;

  @IsOptional()
  @IsEnum(ProductStatus)
  status?: ProductStatus;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @Matches(IMAGE_URL, { each: true, message: 'images must be uploaded through the app' })
  images?: string[];
}

export class NewVariantDto {
  @IsSku()
  sku?: string;

  @IsShortText()
  color?: string;

  @IsShortText()
  size?: string;

  @IsMoney()
  price: number;

  @IsOptional()
  @IsMoney()
  costPrice?: number;

  /** Supplier barcode, if the item already has one. */
  @IsOptional()
  @IsBarcodeCode()
  barcode?: string;
}

export class NewComponentDto {
  /** e.g. "Side panels" — shown as "Box A – Side panels". */
  @IsShortText(80)
  label?: string;

  @IsInt()
  @Min(1)
  @Max(99)
  quantity: number;

  @IsSku()
  sku?: string;

  @IsOptional()
  @IsBarcodeCode()
  barcode?: string;
}

class NewKitDto {
  @IsSku()
  sku?: string;

  @IsMoney()
  price: number;

  @IsOptional()
  @IsMoney()
  costPrice?: number;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(26)
  @ValidateNested({ each: true })
  @Type(() => NewComponentDto)
  components: NewComponentDto[];
}

export class CreateProductDto extends ProductInfoDto {
  @IsEnum(ProductType)
  type: ProductType;

  /** Required for STANDARD products: one row per colour/size (or one default row). */
  @ValidateIf((o: CreateProductDto) => o.type === ProductType.STANDARD)
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => NewVariantDto)
  variants?: NewVariantDto[];

  /** Required for KIT products. */
  @ValidateIf((o: CreateProductDto) => o.type === ProductType.KIT)
  @ValidateNested()
  @Type(() => NewKitDto)
  kit?: NewKitDto;
}

export class UpdateProductDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string | null;

  @ValidateIf((_, v) => v !== null && v !== undefined)
  @IsUUID()
  categoryId?: string | null;

  @ValidateIf((_, v) => v !== null && v !== undefined)
  @IsString()
  @MaxLength(80)
  brand?: string | null;

  @ValidateIf((_, v) => v !== null && v !== undefined)
  @IsUUID()
  taxRateId?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100000)
  minStock?: number;

  @IsOptional()
  @IsEnum(ProductStatus)
  status?: ProductStatus;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @Matches(IMAGE_URL, { each: true, message: 'images must be uploaded through the app' })
  images?: string[];
}

export class UpdateVariantDto {
  @IsSku()
  sku?: string;

  /** STANDARD only. */
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @IsString()
  @MaxLength(60)
  color?: string | null;

  /** STANDARD only. */
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @IsString()
  @MaxLength(60)
  size?: string | null;

  /** COMPONENT only: the part after "Box A – ". */
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @IsString()
  @MaxLength(80)
  label?: string | null;

  /** COMPONENT only: boxes needed per kit. */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(99)
  quantity?: number;

  /** STANDARD and KIT only. */
  @IsOptional()
  @IsMoney()
  price?: number;

  @ValidateIf((_, v) => v !== null && v !== undefined)
  @IsMoney()
  costPrice?: number | null;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class AddBarcodeDto {
  @IsBarcodeCode()
  code: string;
}

export class SetActiveDto {
  @IsBoolean()
  active: boolean;
}

export class ListProductsQuery {
  @IsShortText(100)
  q?: string;

  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsEnum(ProductStatus)
  status?: ProductStatus;

  @IsOptional()
  @IsEnum(ProductType)
  type?: ProductType;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}
