import { IsString, IsOptional, IsNumber, IsObject } from 'class-validator';

export class CreateFeedbackDto {
    @IsString()
    organizationId: string;

    @IsString()
    source: string;

    @IsString()
    content: string;

    @IsNumber()
    @IsOptional()
    sentimentScore?: number;

    @IsObject()
    @IsOptional()
    metadata?: any;
}

export class CreateDecisionDto {
    @IsString()
    organizationId: string;

    @IsString()
    agentName: string;

    @IsString()
    actionType: string;

    @IsString()
    reasoning: string;

    @IsString()
    @IsOptional()
    priority?: string;

    @IsObject()
    @IsOptional()
    decisionMetadata?: any;
}
