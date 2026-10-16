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

  @IsOptional()
  @IsString()
  @MaxLength(300)
  businessAddress?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  businessPhone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  vatNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  receiptFooter?: string;

  @IsOptional()
  @IsInt()
  @Min(48)
  @Max(120)
  receiptWidthMm?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  maxDiscountPercent?: number;
}
