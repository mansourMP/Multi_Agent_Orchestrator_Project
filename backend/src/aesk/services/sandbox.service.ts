import { Injectable, Logger } from '@nestjs/common';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';

const execAsync = promisify(exec);

export interface ExecutionResult {
    success: boolean;
    output: string;
    error?: string;
    durationMs: number;
}

@Injectable()
export class SandboxService {
    private readonly logger = new Logger(SandboxService.name);
    private readonly tempDir = path.join(__dirname, '../../../../temp_executions');

    constructor() {
        // Ensure temp directory exists
        if (!fs.existsSync(this.tempDir)) {
            fs.mkdirSync(this.tempDir, { recursive: true });
        }
    }

    /**
     * Executes code in a secure Docker container
     */
    async execute(language: 'python' | 'javascript' | 'typescript', code: string): Promise<ExecutionResult> {
        this.logger.log(`⏳ [SANDBOX] Preparing to dream (execute) ${language} code...`);
        const startTime = Date.now();
        const filename = `run_${Date.now()}_${Math.random().toString(36).substring(7)}`;

        try {
            // 1. Write code to a temp file
            const ext = this.getExtension(language);
            const scriptPath = path.join(this.tempDir, `${filename}.${ext}`);
            fs.writeFileSync(scriptPath, code);

            // 2. Determine Docker Image & Command
            // We mount the temp file into the container to run it
            const { image, cmd } = this.getContainerConfig(language, `${filename}.${ext}`);

            // Docker command:
            // --rm: Remove container after run
            // -v: Mount temp dir
            // --network none: No internet access (safety)
            // --memory 512m: Limit RAM
            const dockerCmd = `docker run --rm -v "${this.tempDir}:/app" -w /app --network none --memory 512m ${image} ${cmd}`;

            this.logger.debug(`[DOCKER] Running: ${dockerCmd}`);

            // 3. Execute
            const { stdout, stderr } = await execAsync(dockerCmd, { timeout: 10000 }); // 10s timeout

            const durationMs = Date.now() - startTime;

            // Cleanup file
            this.cleanup(scriptPath);

            if (stderr && stderr.length > 0) {
                this.logger.warn(`⚠️ [SANDBOX] Dream had stderr: ${stderr}`);
            }

            return {
                success: true,
                output: stdout.trim() || stderr.trim(),
                durationMs
            };

        } catch (error) {
            const durationMs = Date.now() - startTime;
            // Cleanup file
            const ext = this.getExtension(language);
            this.cleanup(path.join(this.tempDir, `${filename}.${ext}`));

            this.logger.error(`❌ [SANDBOX] Nightmare (Execution Failed): ${error.message}`);

            return {
                success: false,
                output: '',
                error: error.message,
                durationMs
            };
        }
    }

    private getExtension(lang: string) {
        switch (lang) {
            case 'python': return 'py';
            case 'javascript': return 'js';
            case 'typescript': return 'ts';
            default: return 'txt';
        }
    }

    private getContainerConfig(lang: string, filename: string) {
        switch (lang) {
            case 'python':
                return { image: 'python:3.9-slim', cmd: `python ${filename}` };
            case 'javascript':
                return { image: 'node:18-alpine', cmd: `node ${filename}` };
            case 'typescript':
                // For TS we'd need ts-node or compile first. Using node for now for simplicity or generic alpine
                return { image: 'node:18-alpine', cmd: `node ${filename}` };
            default:
                throw new Error(`Unsupported language: ${lang}`);
        }
    }

    private cleanup(filepath: string) {
        try {
            if (fs.existsSync(filepath)) fs.unlinkSync(filepath);
        } catch (e) { }
    }
}
