import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ChromaClient, Collection } from 'chromadb';
import OpenAI from 'openai';

@Injectable()
export class VectorMemoryService implements OnModuleInit {
    private readonly logger = new Logger(VectorMemoryService.name);
    private client: ChromaClient;
    private collection: Collection;
    private openai: OpenAI;
    private isConnected = false;

    constructor() {
        this.client = new ChromaClient({
            path: process.env.CHROMA_URL || "http://localhost:8000"
        });

        this.openai = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY,
        });
    }

    async onModuleInit() {
        try {
            await this.initializeCollection();
            this.isConnected = true;
            this.logger.log('🧠 [TELEPATHY] Connected to ChromaDB Vector Store');
        } catch (error) {
            this.logger.warn('⚠️ [TELEPATHY] Failed to connect to ChromaDB. Memory will be short-term only.');
            // We don't throw here to allow the app to run without Vector DB
        }
    }

    private async initializeCollection() {
        // Create or get the "company-brain" collection
        this.collection = await this.client.getOrCreateCollection({
            name: "company_brain",
            metadata: { "description": "Long-term memory for AESK Agents" }
        });
    }

    /**
     * Stores a memory (text) with metadata into the vector store
     */
    async storeMemory(text: string, metadata: any, id?: string) {
        if (!this.isConnected) return;

        try {
            // 1. Generate Embedding
            const embedding = await this.getEmbedding(text);

            // 2. Save to Chroma
            await this.collection.add({
                ids: [id || `mem_${Date.now()}_${Math.random().toString(36).substring(7)}`],
                embeddings: [embedding],
                metadatas: [metadata],
                documents: [text]
            });

            this.logger.log(`💾 [MEMORY] Stored: "${text.substring(0, 50)}..."`);
        } catch (error) {
            this.logger.error('Failed to store memory', error);
        }
    }

    /**
     * Recalls relevant memories based on a query
     */
    async recall(query: string, limit = 5) {
        if (!this.isConnected) return [];

        try {
            // 1. Embed query
            const queryEmbedding = await this.getEmbedding(query);

            // 2. Search
            const results = await this.collection.query({
                queryEmbeddings: [queryEmbedding],
                nResults: limit
            });

            // 3. Format results
            // Chroma returns arrays of arrays, we flatten the first result
            const memories = [];
            if (results.ids.length > 0) {
                for (let i = 0; i < results.ids[0].length; i++) {
                    memories.push({
                        id: results.ids[0][i],
                        content: results.documents[0][i],
                        metadata: results.metadatas[0][i],
                        distance: results.distances ? results.distances[0][i] : null
                    });
                }
            }

            this.logger.log(`🔍 [RECALL] Found ${memories.length} relevant memories for "${query.substring(0, 20)}..."`);
            return memories;

        } catch (error) {
            this.logger.error('Failed to recall memory', error);
            return [];
        }
    }

    private async getEmbedding(text: string): Promise<number[]> {
        const response = await this.openai.embeddings.create({
            model: "text-embedding-3-small",
            input: text,
        });
        return response.data[0].embedding;
    }
}
