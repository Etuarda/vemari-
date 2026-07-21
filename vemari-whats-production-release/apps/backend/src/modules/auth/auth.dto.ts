import { IsEmail, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;
}

export class InvitationTokenDto {
  @IsString()
  @MinLength(32)
  token!: string;
}

export class ActivateAccountDto extends InvitationTokenDto {
  @IsString()
  @MinLength(8)
  password!: string;

  @IsString()
  @MinLength(8)
  passwordConfirmation!: string;
}
