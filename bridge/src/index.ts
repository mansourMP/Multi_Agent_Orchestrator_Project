#!/usr/bin/env node
import { io } from "socket.io-client";
import { spawn } from "child_process";
import chalk from "chalk";
import * as os from "os";
import * as dotenv from "dotenv";

dotenv.config();

const SERVER_URL = process.env.CONDUCTOR_URL || "http://localhost:3000";
const BRIDGE_ID = os.hostname();

console.clear();
console.log(chalk.bold.cyan(`
   ______                 __            __            
  / ____/___  ____  ____/ /_  _______/ /_____  _____
 / /   / __ \\/ __ \\/ __  / / / / ___/ __/ __ \\/ ___/
/ /___/ /_/ / / / / /_/ / /_/ / /__/ /_/ /_/ / /    
\\____/\\____/_/ /_/\\__,_/\\__,_/\\___/\\__/\\____/_/     
                                                    
`));
console.log(chalk.cyan(`🔌 Conductor Bridge v1.0.0`));
console.log(chalk.gray(`----------------------------------------`));
console.log(chalk.white(`Target Server: `) + chalk.green(SERVER_URL));
console.log(chalk.white(`Device Name:   `) + chalk.yellow(BRIDGE_ID));
console.log(chalk.white(`Work Directory:`) + chalk.gray(process.cwd()));
console.log(chalk.gray(`----------------------------------------`));

const socket = io(SERVER_URL, {
    auth: {
        type: 'bridge',
        bridgeId: BRIDGE_ID
    },
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
});

socket.on("connect", () => {
    console.log(chalk.green(`\n✅ Connected to Server successfully!`));
    console.log(chalk.gray(`Creating connection tunnel...`));
    console.log(chalk.gray(`Waiting for commands...`));
});

socket.on("connect_error", (err) => {
    console.log(chalk.red(`❌ Connection Error: ${err.message}`));
    console.log(chalk.gray(`Retrying...`));
});

socket.on("disconnect", () => {
    console.log(chalk.yellow(`\n⚠️  Disconnected from server. Attempting to reconnect...`));
});

// COMMAND EXECUTION HANDLER
socket.on("execute_command", async (payload: { executionId: string, command: string, cwd?: string }) => {
    const { executionId, command, cwd } = payload;
    console.log(chalk.white(`\n[${new Date().toLocaleTimeString()}] `) + chalk.blue(`🚀 Executing: `) + chalk.bold(command));

    try {
        const proc = spawn(command, {
            shell: true,
            cwd: cwd || process.cwd(),
            env: { ...process.env, FORCE_COLOR: 'true' }
        });

        proc.stdout.on("data", (data) => {
            const output = data.toString();
            process.stdout.write(chalk.gray(`  > ${output}`));
            socket.emit("bridge_log", { executionId, output });
        });

        proc.stderr.on("data", (data) => {
            const output = data.toString();
            process.stderr.write(chalk.red(`  > ${output}`));
            socket.emit("bridge_log", { executionId, output, type: 'error' });
        });

        proc.on("close", (code) => {
            const success = code === 0;
            console.log(chalk.white(`[${new Date().toLocaleTimeString()}] `) + (success ? chalk.green(`✅ Command finished`) : chalk.red(`❌ Command failed (Exit: ${code})`)));
            socket.emit("bridge_complete", { executionId, exitCode: code });
        });

        proc.on("error", (err) => {
            console.error(chalk.red(`Failed to spawn process: ${err.message}`));
            socket.emit("bridge_complete", { executionId, exitCode: 1, error: err.message });
        });

    } catch (e: any) {
        console.error(chalk.red(`Execution Exception: ${e.message}`));
        socket.emit("bridge_complete", { executionId, exitCode: 1, error: e.message });
    }
});

// Keep process alive
process.on('SIGINT', () => {
    console.log(chalk.yellow('\n\nShutting down bridge...'));
    socket.disconnect();
    process.exit(0);
});
