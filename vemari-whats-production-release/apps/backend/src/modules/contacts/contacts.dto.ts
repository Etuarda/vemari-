import { ConsentStatus } from '@prisma/client';
import {
  IsEmail,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

export class CreateContactDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsString()
  phone!: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  source?: string;

  @IsOptional()
  @IsObject()
  customFields?: Record<string, unknown>;
}

export class RegisterConsentDto {
  @IsEnum(ConsentStatus)
  status!: ConsentStatus;

  @IsString()
  @MinLength(3)
  purpose!: string;

  @IsString()
  channel!: string;

  @IsString()
  source!: string;

  @IsOptional()
  @IsString()
  evidence?: string;

  @IsOptional()
  @IsString()
  termVersion?: string;
}

export class CreateSuppressionDto {
  @IsString()
  @MinLength(3)
  reason!: string;

  @IsString()
  source!: string;
}
