import { spawn } from 'node:child_process';
import readline from 'node:readline';

const colors = {
  reset: '\x1b[0m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  dim: '\x1b[2m',
};

const services = [
  { name: 'api', cmd: 'npm', args: ['run', 'dev:api'], color: colors.cyan },
  {
    name: 'worker',
    cmd: 'npm',
    args: ['run', 'dev:worker'],
    color: colors.magenta,
  },
  { name: 'web', cmd: 'npm', args: ['run', 'dev:web'], color: colors.yellow },
  {
    name: 'admin',
    cmd: 'npm',
    args: ['run', 'dev:admin'],
    color: colors.yellow,
  },
];

const children = [];

for (const svc of services) {
  const child = spawn(svc.cmd, svc.args, {
    stdio: ['inherit', 'pipe', 'pipe'],
    env: process.env,
    shell: true,
  });

  children.push(child);

  const prefix = `${svc.color}[${svc.name}]${colors.reset} `;

  const pipeStream = (stream, isErr = false) => {
    const rl = readline.createInterface({ input: stream });
    rl.on('line', (line) => {
      const out = isErr ? `${colors.red}${line}${colors.reset}` : line;
      console.log(`${prefix}${out}`);
    });
  };

  pipeStream(child.stdout, false);
  pipeStream(child.stderr, true);

  child.on('error', (err) => {
    console.error(
      `${prefix}${colors.red}Process error: ${err.message}${colors.reset}`,
    );
  });

  child.on('exit', (code, signal) => {
    if (signal) {
      console.log(
        `${prefix}${colors.dim}Exited with signal ${signal}${colors.reset}`,
      );
    } else if (code !== 0 && code !== null) {
      console.log(
        `${prefix}${colors.red}Exited with code ${code}${colors.reset}`,
      );
    }
  });
}

function cleanup() {
  for (const child of children) {
    if (!child.killed) {
      try {
        child.kill('SIGTERM');
      } catch {
        /* Child process may already have exited. */
      }
    }
  }
}

process.on('SIGINT', () => {
  cleanup();
  process.exit(0);
});
process.on('SIGTERM', () => {
  cleanup();
  process.exit(0);
});
process.on('exit', cleanup);
