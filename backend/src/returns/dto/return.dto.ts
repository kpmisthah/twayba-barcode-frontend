import { PaymentMethod, ReturnCondition } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class ReturnLineDto {
  @IsUUID()
  saleLineId: string;

  @IsInt()
  @Min(1)
  @Max(10_000)
  quantity: number;

  @IsEnum(ReturnCondition)
  condition: ReturnCondition;

  /** Where good items go back to. Ignored for DAMAGED (always the Damaged location). */
  @IsOptional()
  @IsUUID()
  locationId?: string;
}

export class CreateReturnDto {
  @IsUUID()
  saleId: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => ReturnLineDto)
  lines: ReturnLineDto[];

  @IsEnum(PaymentMethod)
  refundMethod: PaymentMethod;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  refundReference?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  reason?: string;
}

export class ListReturnsQuery {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

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
