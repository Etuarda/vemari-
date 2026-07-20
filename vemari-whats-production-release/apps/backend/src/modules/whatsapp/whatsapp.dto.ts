import { IsOptional, IsString, Matches } from 'class-validator';

export class TestMessageDto {
  @IsString()
  @Matches(/^\+?[1-9]\d{7,14}$/)
  to!: string;

  @IsOptional()
  @IsString()
  templateName?: string = 'hello_world';

  @IsOptional()
  @IsString()
  languageCode?: string = 'en_US';
}
