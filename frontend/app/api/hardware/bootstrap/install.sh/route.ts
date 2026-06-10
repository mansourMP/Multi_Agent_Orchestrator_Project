import { readFile } from 'node:fs/promises';
import path from 'node:path';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const installerCandidates = [
  path.resolve(process.cwd(), '..', 'scripts', 'install-agent-computer.sh'),
  path.resolve(process.cwd(), 'scripts', 'install-agent-computer.sh'),
];

export async function GET(): Promise<Response> {
  for (const candidate of installerCandidates) {
    try {
      const script = await readFile(candidate, 'utf8');
      return new Response(script, {
        status: 200,
        headers: {
          'content-type': 'text/plain; charset=utf-8',
          'cache-control': 'no-store',
        },
      });
    } catch {
      // Try the next traced path candidate.
    }
  }

  return Response.json(
    { detail: 'Agent Computer installer is not available' },
    { status: 404 },
  );
}
