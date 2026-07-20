import { IsInt, IsOptional, IsString, IsUUID, MaxLength, Min, MinLength } from 'class-validator';

export class AssignConversationDto {
  @IsUUID()
  userId!: string;

  @IsInt()
  @Min(1)
  version!: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class SendMessageDto {
  @IsString()
  @MinLength(1)
  @MaxLength(4096)
  content!: string;
}

export class InternalNoteDto {
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  content!: string;
}
