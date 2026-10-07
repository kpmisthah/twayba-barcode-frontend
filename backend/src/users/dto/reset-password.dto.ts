import { IsString, MaxLength, MinLength } from 'class-validator';
import { PASSWORD_MIN_LENGTH } from '../../common/password.js';

export class ResetPasswordDto {
  @IsString()
  @MinLength(PASSWORD_MIN_LENGTH)
  @MaxLength(200)
  newPassword: string;
}
