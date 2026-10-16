import { StocktakeStatus } from '@prisma/client';
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min, ValidateIf } from 'class-validator';

export class CreateStocktakeDto {
  /** Count this location and everything inside it. */
  @IsUUID()
  locationId: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;
}

/** Either set the count (`counted`) or add to it (`add`, e.g. +1 per scan — safe with several counters). */
export class CountDto {
  @IsUUID()
  variantId: string;

  @IsUUID()
  locationId: string;

  @ValidateIf((o: CountDto) => o.add === undefined)
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  counted?: number;

  @ValidateIf((o: CountDto) => o.counted === undefined)
  @IsInt()
  @Min(-1000)
  @Max(1000)
  add?: number;
}

export class SubmitStocktakeDto {
  /** Lines nobody counted are treated as 0 (nothing found). Otherwise submitting is refused. */
  @IsOptional()
  @IsBoolean()
  uncountedAsZero?: boolean;
}

export class ListStocktakesQuery {
  @IsOptional()
  @IsEnum(StocktakeStatus)
  status?: StocktakeStatus;
}
