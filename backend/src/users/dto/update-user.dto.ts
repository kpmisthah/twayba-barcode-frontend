import { Role } from '@prisma/client';
import {
  ArrayMaxSize,
  IsArray,
  IsUUID,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { PHONE_PATTERN } from './create-user.dto.js';

/** Send `null` for email/phone to clear it. */
export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name?: string;

  @ValidateIf((_, v) => v !== undefined && v !== null)
  @IsEmail()
  @MaxLength(200)
  email?: string | null;

  @ValidateIf((_, v) => v !== undefined && v !== null)
  @Matches(PHONE_PATTERN, { message: 'phone must be a valid phone number' })
  phone?: string | null;

  @IsOptional()
  @IsEnum(Role)
  role?: Role;

  /** Sites this person may change stock in; [] = all sites. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsUUID('all', { each: true })
  siteIds?: string[];
}
