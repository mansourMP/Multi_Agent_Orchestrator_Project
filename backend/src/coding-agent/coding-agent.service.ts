import { Injectable } from '@nestjs/common';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';
import { LlmService } from '../ai/llm.service';

const execAsync = promisify(exec);

export interface CodingTaskResult {
    success: boolean;
    code: string;
    tests?: string;
    executionLogs: string[];
    errorMessage?: string;
    retryCount: number;
}

@Injectable()
export class CodingAgentService {
    private readonly MAX_RETRIES = 3;
    private readonly WORKSPACE_DIR = './coding-workspace';

    constructor(private llm: LlmService) { }

    /**
     * Execute a coding task with self-correction loop
     */
    async executeTask(spec: {
        description: string;
        language: 'typescript' | 'python' | 'javascript' | 'bash';
        requirements?: string[];
        context?: string;
    }): Promise<CodingTaskResult> {
        const logs: string[] = [];
        let retryCount = 0;

        logs.push(`[Coding Agent] Starting task: ${spec.description}`);
        logs.push(`[Coding Agent] Language: ${spec.language}`);

        // Ensure workspace exists
        await this.ensureWorkspace();

        // Generate initial code
        logs.push(`[Coding Agent] Generating code...`);
        let code = await this.generateCode(spec);

        // Save code to file
        const filename = await this.saveCode(code, spec.language);
        logs.push(`[Coding Agent] Code saved to: ${filename}`);

        // Attempt to run with self-correction
        while (retryCount < this.MAX_RETRIES) {
            try {
                logs.push(`[Coding Agent] Attempt ${retryCount + 1}/${this.MAX_RETRIES}: Running code...`);

                const result = await this.runCode(filename, spec.language);

                if (result.success) {
                    logs.push(`[Coding Agent] ✅ Code executed successfully!`);
                    logs.push(...result.logs);

                    return {
                        success: true,
                        code,
                        executionLogs: logs,
                        retryCount
                    };
                } else {
                    throw new Error(result.error || 'Execution failed');
                }

            } catch (error) {
                retryCount++;
                logs.push(`[Coding Agent] ❌ Attempt ${retryCount} failed: ${error.message}`);

                if (retryCount >= this.MAX_RETRIES) {
                    logs.push(`[Coding Agent] 🚨 MAX RETRIES REACHED. Task failed.`);
                    return {
                        success: false,
                        code,
                        executionLogs: logs,
                        errorMessage: error.message,
                        retryCount
                    };
                }

                // Self-correct
                logs.push(`[Coding Agent] 🔧 Self-correcting...`);
                code = await this.selfCorrect(code, error.message, spec);
                await this.saveCode(code, spec.language, filename);
                logs.push(`[Coding Agent] Updated code saved`);
            }
        }

        return {
            success: false,
            code,
            executionLogs: logs,
            errorMessage: 'Max retries exceeded',
            retryCount
        };
    }

    /**
     * Generate code using LLM
     */
    private async generateCode(spec: {
        description: string;
        language: string;
        requirements?: string[];
        context?: string;
    }): Promise<string> {
        const systemPrompt = `You are an expert ${spec.language} developer. Generate PRODUCTION-READY code.

CRITICAL RULES:
1. Generate ONLY executable code, no explanations
2. Do NOT use libraries that don't exist
3. Handle errors properly
4. Add minimal but useful comments
5. Follow ${spec.language} best practices`;

        const userPrompt = `Task: ${spec.description}

${spec.context ? `Context:\n${spec.context}\n` : ''}

${spec.requirements ? `Requirements:\n${spec.requirements.map((r, i) => `${i + 1}. ${r}`).join('\n')}\n` : ''}

Generate complete, runnable ${spec.language} code. Output ONLY the code, no markdown, no explanations.`;

        return (await this.llm.generateCompletion(userPrompt, systemPrompt, 'gpt-4')) || '';
    }

    /**
     * Self-correct code based on error
     */
    private async selfCorrect(
        brokenCode: string,
        errorMessage: string,
        spec: any
    ): Promise<string> {
        const systemPrompt = `You are a debugging expert. Fix code errors.`;

        const userPrompt = `This ${spec.language} code failed with an error.

ORIGINAL CODE:
\`\`\`${spec.language}
${brokenCode}
\`\`\`

ERROR:
${errorMessage}

TASK WAS: ${spec.description}

Fix the code. Return ONLY the corrected code, no markdown, no explanations.`;

        return (await this.llm.generateCompletion(userPrompt, systemPrompt, 'gpt-4')) || '';
    }

    /**
     * Run code in a sandboxed environment
     */
    private async runCode(
        filename: string,
        language: string
    ): Promise<{ success: boolean; logs: string[]; error?: string }> {
        const logs: string[] = [];

        try {
            const commands = {
                typescript: `npx ts-node ${filename}`,
                javascript: `node ${filename}`,
                python: `python3 ${filename}`,
                bash: `bash ${filename}`
            };

            const command = commands[language as keyof typeof commands];
            if (!command) {
                throw new Error(`Unsupported language: ${language}`);
            }

            logs.push(`[Executor] Running: ${command}`);

            // Execute with timeout (10 seconds)
            const { stdout, stderr } = await Promise.race([
                execAsync(command, {
                    cwd: this.WORKSPACE_DIR,
                    timeout: 10000, // 10 second timeout
                    maxBuffer: 1024 * 1024 // 1MB buffer
                }),
                new Promise<never>((_, reject) =>
                    setTimeout(() => reject(new Error('Execution timeout')), 10000)
                )
            ]);

            if (stdout) logs.push(`[Output] ${stdout.trim()}`);
            if (stderr && !stderr.includes('Debugger')) {
                logs.push(`[Stderr] ${stderr.trim()}`);
            }

            // Check for common error indicators
            if (stderr && (
                stderr.toLowerCase().includes('error') ||
                stderr.toLowerCase().includes('exception') ||
                stderr.toLowerCase().includes('traceback')
            )) {
                return { success: false, logs, error: stderr };
            }

            return { success: true, logs };

        } catch (error) {
            logs.push(`[Error] ${error.message}`);
            return { success: false, logs, error: error.message };
        }
    }

    /**
     * Save code to workspace
     */
    private async saveCode(
        code: string,
        language: string,
        filename?: string
    ): Promise<string> {
        const extensions = {
            typescript: 'ts',
            javascript: 'js',
            python: 'py',
            bash: 'sh'
        };

        const ext = extensions[language as keyof typeof extensions] || 'txt';
        const file = filename || `generated_${Date.now()}.${ext}`;
        const fullPath = path.join(this.WORKSPACE_DIR, file);

        await fs.writeFile(fullPath, code, 'utf-8');
        return file;
    }

    /**
     * Ensure workspace directory exists
     */
    private async ensureWorkspace(): Promise<void> {
        try {
            await fs.access(this.WORKSPACE_DIR);
        } catch {
            await fs.mkdir(this.WORKSPACE_DIR, { recursive: true });
        }
    }

    /**
     * Clean up old workspace files
     */
    async cleanWorkspace(): Promise<void> {
        try {
            const files = await fs.readdir(this.WORKSPACE_DIR);
            const now = Date.now();
            const ONE_HOUR = 60 * 60 * 1000;

            for (const file of files) {
                const filePath = path.join(this.WORKSPACE_DIR, file);
                const stats = await fs.stat(filePath);

                // Delete files older than 1 hour
                if (now - stats.mtimeMs > ONE_HOUR) {
                    await fs.unlink(filePath);
                }
            }
        } catch (error) {
            // Ignore cleanup errors
        }
    }
}
