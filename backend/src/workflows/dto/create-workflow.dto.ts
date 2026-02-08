import { IsNotEmpty, IsOptional, IsString, IsObject, IsEnum } from 'class-validator';

export class CreateWorkflowDto {
    @IsNotEmpty()
    @IsString()
    name: string;

    @IsOptional()
    @IsString()
    description?: string;

    @IsNotEmpty()
    @IsObject()
    definition: Record<string, any>;
}
