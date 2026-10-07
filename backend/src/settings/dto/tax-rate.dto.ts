import { PartialType } from '@nestjs/mapped-types';
import { IsBoolean, IsNotEmpty, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class CreateTaxRateDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  name: string;

  /** Percentage, e.g. 18 for 18%. */
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  rate: number;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class UpdateTaxRateDto extends PartialType(CreateTaxRateDto) {}
