import { Type } from 'class-transformer';
import {
  IsDate,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
} from 'class-validator';

export class CreateCampaignDto {
  @IsString()
  @MinLength(3)
  name!: string;

  @IsUUID()
  templateId!: string;

  @IsOptional()
  @IsUUID()
  segmentId?: string;

  @IsOptional()
  @IsObject()
  templateParameters?: Record<string, unknown>;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  scheduledAt?: Date;
}
