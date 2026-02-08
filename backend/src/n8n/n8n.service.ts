import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class N8nService {
    private readonly logger = new Logger(N8nService.name);
    private readonly baseUrl: string;
    private readonly apiKey: string;

    constructor(private configService: ConfigService) {
        this.baseUrl = this.configService.get<string>('N8N_BASE_URL') || 'http://localhost:5678/api/v1';
        this.apiKey = this.configService.get<string>('N8N_API_KEY') || '';
    }

    /**
     * Converts AgentForge internal workflow definition to n8n JSON format
     */
    mapToN8n(workflowName: string, definitionInput: any): any {
        const definition = typeof definitionInput === 'string'
            ? JSON.parse(definitionInput)
            : definitionInput;

        const nodes = definition.nodes || [];
        const edges = definition.edges || [];

        const n8nNodes = nodes.map((node: any) => {
            let n8nType = 'n8n-nodes-base.noOp';
            let parameters = {};

            switch (node.type) {
                case 'trigger':
                    n8nType = 'n8n-nodes-base.webhook';
                    parameters = { path: node.id, options: {} };
                    break;
                case 'agent':
                    // Using a placeholder for n8n AI agent node or HTTP Request to our backend
                    n8nType = 'n8n-nodes-base.httpRequest';
                    parameters = {
                        url: `${this.configService.get('BACKEND_URL')}/api/v1/executions/step`,
                        method: 'POST',
                        body: {
                            nodeId: node.id,
                            model: node.data.model,
                            prompt: node.data.systemPrompt
                        }
                    };
                    break;
                case 'tool':
                    n8nType = 'n8n-nodes-base.httpRequest';
                    parameters = {
                        url: `https://api.example.com/${node.data.action}`,
                        method: 'GET'
                    };
                    break;
            }

            return {
                parameters,
                id: node.id,
                name: node.data.label,
                type: n8nType,
                typeVersion: 1,
                position: [node.position.x, node.position.y]
            };
        });

        const connections: any = {};
        edges.forEach((edge: any) => {
            if (!connections[edge.source]) connections[edge.source] = { main: [[]] };
            connections[edge.source].main[0].push({
                node: edge.target,
                type: 'main',
                index: 0
            });
        });

        return {
            name: workflowName,
            nodes: n8nNodes,
            connections,
            settings: { executionTimeout: 3600 },
            staticData: null,
            pinData: {},
            versionId: null
        };
    }

    async syncWorkflow(workflow: any) {
        if (!this.apiKey) {
            this.logger.warn('N8N_API_KEY is missing. Skipping real sync.');
            return { id: 'mock-n8n-id', message: 'Dry run successful' };
        }

        try {
            const n8nWorkflow = this.mapToN8n(workflow.name, workflow.definition);

            const response = await fetch(`${this.baseUrl}/workflows`, {
                method: 'POST',
                headers: {
                    'X-N8N-API-KEY': this.apiKey,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(n8nWorkflow)
            });

            if (!response.ok) {
                throw new Error(`n8n sync failed: ${response.statusText}`);
            }

            return response.json();
        } catch (error) {
            this.logger.error(`Failed to sync with n8n: ${error.message}`);
            throw error;
        }
    }
}
