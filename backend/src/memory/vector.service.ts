import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

@Injectable()
export class VectorService {
    private readonly logger = new Logger(VectorService.name);
    private openai: OpenAI;

    constructor(private configService: ConfigService) {
        this.openai = new OpenAI({
            apiKey: this.configService.get<string>('OPENAI_API_KEY'),
        });
    }

    /**
     * Generates embeddings for a given text
     */
    async generateEmbedding(text: string): Promise<number[]> {
        try {
            const response = await this.openai.embeddings.create({
                model: 'text-embedding-3-small',
                input: text,
            });
            return response.data[0].embedding;
        } catch (error) {
            this.logger.error(`Failed to generate embedding: ${error.message}`);
            throw error;
        }
    }

    /**
     * Implementation for Pinecone / Weaviate would go here.
     * For the demo, we log the action.
     */
    async upsert(id: string, vector: number[], metadata: any) {
        this.logger.log(`[VectorService] Upserting vector for ${id} with metadata: ${JSON.stringify(metadata)}`);
        // TODO: Real Vector DB call
        return true;
    }

    async query(vector: number[], topK: number = 3) {
        this.logger.log(`[VectorService] Querying top ${topK} vectors`);
        // TODO: Real Vector DB call
        return []; // Mocked results
    }
}
