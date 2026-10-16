import { PaymentMethod } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class SalePickDto {
  @IsUUID()
  variantId: string;

  @IsUUID()
  locationId: string;

  @IsInt()
  @Min(1)
  @Max(10_000)
  quantity: number;
}

export class PriceLineDto {
  /** A STANDARD variant, or a KIT variant for a whole kit. */
  @IsUUID()
  variantId: string;

  @IsInt()
  @Min(1)
  @Max(10_000)
  quantity: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  discountPercent?: number;
}

export class SaleLineDto extends PriceLineDto {
  /** Where the stock came from: one entry per space (a kit has entries for every box). */
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => SalePickDto)
  picks: SalePickDto[];
}

export class PaymentDto {
  @IsEnum(PaymentMethod)
  method: PaymentMethod;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(10_000_000)
  amount: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  reference?: string;
}

/** An admin/manager types their login on the cashier's device to approve a big discount. */
export class ApprovalDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  login: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  password: string;
}

export class PreviewSaleDto {
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => PriceLineDto)
  lines: PriceLineDto[];
}

export class CreateSaleDto {
  @IsOptional()
  @IsUUID()
  siteId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  customerName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  customerPhone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => SaleLineDto)
  lines: SaleLineDto[];

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => PaymentDto)
  payments: PaymentDto[];

  @IsOptional()
  @ValidateNested()
  @Type(() => ApprovalDto)
  approval?: ApprovalDto;
}

export class SummaryQuery {
  @IsDateString()
  from: string;

  @IsDateString()
  to: string;
}

export class ListSalesQuery {
  /** Invoice number or customer name/phone. */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

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
