import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';
import { PASSWORD_MIN_LENGTH } from '../../common/password.js';

export class ChangePasswordDto {
  @IsString()
  @IsNotEmpty()
  currentPassword: string;

  @IsString()
  @MinLength(PASSWORD_MIN_LENGTH)
  @MaxLength(200)
  newPassword: string;
}
