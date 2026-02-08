import { promises as fs } from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const filePath = path.resolve(process.cwd(), '..', 'WORK_LOG_SUMMARY.md');
    const content = await fs.readFile(filePath, 'utf8');
    return new Response(content, {
      headers: { 'content-type': 'text/plain; charset=utf-8' }
    });
  } catch (err) {
    return new Response('Work log not found.', { status: 404 });
  }
}
