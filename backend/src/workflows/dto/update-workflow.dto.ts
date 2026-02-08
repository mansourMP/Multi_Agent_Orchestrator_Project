import { IsOptional, IsString, IsObject, IsEnum } from 'class-validator';

export class UpdateWorkflowDto {
    @IsOptional()
    @IsString()
    name?: string;

    @IsOptional()
    @IsString()
    description?: string;

    @IsOptional()
    @IsObject()
    definition?: Record<string, any>;

    @IsOptional()
    @IsString()
    status?: string; // pending enum validation later
}
