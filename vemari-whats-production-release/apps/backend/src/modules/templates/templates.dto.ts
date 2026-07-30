import { IsArray, IsIn, IsInt, IsOptional, IsPositive, IsString } from 'class-validator';

export class CreateTemplateDto {
  @IsString()
  name!: string;

  @IsString()
  language!: string;

  @IsString()
  category!: string;

  @IsIn(['NAMED', 'POSITIONAL'])
  parameterFormat!: 'NAMED' | 'POSITIONAL';

  @IsArray()
  components!: unknown[];

  @IsOptional()
  @IsInt()
  @IsPositive()
  ttl?: number;
}

export class TemplateFiltersDto {
  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  language?: string;
}
