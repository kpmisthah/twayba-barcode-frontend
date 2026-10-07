import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class LoginDto {
  /** Email or phone number. */
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  login: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  password: string;
}
