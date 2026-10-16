import { TransferStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, IsUUID, Max, MaxLength, Min, ValidateNested } from 'class-validator';

export class TransferLineDto {
  /** A variant, a kit box, or a whole kit (sent as all of its boxes). */
  @IsUUID()
  variantId: string;

  @IsInt()
  @Min(1)
  @Max(100_000)
  quantity: number;
}

export class SendTransferDto {
  @IsUUID()
  fromLocationId: string;

  @IsUUID()
  toLocationId: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => TransferLineDto)
  lines: TransferLineDto[];

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class ReceiveTransferDto {
  /** What arrived now (can be part; the rest stays on the way). */
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => TransferLineDto)
  lines: TransferLineDto[];
}

export class CloseTransferDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  reason: string;
}

export class ListTransfersQuery {
  @IsOptional()
  @IsEnum(TransferStatus)
  status?: TransferStatus;
}
