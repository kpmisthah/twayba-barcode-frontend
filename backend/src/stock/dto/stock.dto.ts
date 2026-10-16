import { MovementType } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

/** What people can do by hand. Reserve/load/deliver/sale come from orders and the POS. */
export const MANUAL_TYPES = [
  MovementType.STOCK_IN,
  MovementType.STOCK_OUT,
  MovementType.TRANSFER,
  MovementType.DAMAGE,
  MovementType.ADJUSTMENT,
] as const;

export class ManualMovementDto {
  @IsIn(MANUAL_TYPES)
  type: (typeof MANUAL_TYPES)[number];

  /** A kit variant means "whole kits": every box is moved (quantity × boxes per kit). */
  @IsUUID()
  variantId: string;

  @IsInt()
  @Min(1)
  @Max(100_000)
  quantity: number;

  @IsOptional()
  @IsUUID()
  fromLocationId?: string;

  /** Not needed for DAMAGE: it always goes to the Damaged location. */
  @IsOptional()
  @IsUUID()
  toLocationId?: string;

  /** Required (from a fixed list) for STOCK_IN / STOCK_OUT — see reasons.ts. */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  reason?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  reference?: string;
}

export class ListMovementsQuery {
  @IsOptional()
  @IsUUID()
  productId?: string;

  @IsOptional()
  @IsUUID()
  variantId?: string;

  @IsOptional()
  @IsUUID()
  locationId?: string;

  @IsOptional()
  @IsEnum(MovementType)
  type?: MovementType;

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
