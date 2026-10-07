import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class UpdateSettingsDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  businessName?: string;

  @IsOptional()
  @IsString()
  @Length(3, 3)
  currency?: string;

  @IsOptional()
  @IsBoolean()
  pricesIncludeTax?: boolean;

  @IsOptional()
  @IsInt()
  @Min(20)
  @Max(150)
  labelWidthMm?: number;

  @IsOptional()
  @IsInt()
  @Min(10)
  @Max(150)
  labelHeightMm?: number;

  @IsOptional()
  @IsBoolean()
  labelShowPrice?: boolean;
}
