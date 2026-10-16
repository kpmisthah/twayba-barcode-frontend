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
  MinLength,
} from 'class-validator';
import { PASSWORD_MIN_LENGTH } from '../../common/password.js';

export const PHONE_PATTERN = /^\+?[\d\s-]{6,20}$/;

export class CreateUserDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(200)
  email?: string;

  @IsOptional()
  @Matches(PHONE_PATTERN, { message: 'phone must be a valid phone number' })
  phone?: string;

  @IsEnum(Role)
  role: Role;

  @IsString()
  @MinLength(PASSWORD_MIN_LENGTH)
  @MaxLength(200)
  password: string;

  /** Sites this person may change stock in; omit or [] = all sites. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsUUID('all', { each: true })
  siteIds?: string[];
}
