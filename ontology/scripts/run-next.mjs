// 빈 포트를 자동으로 찾아 next dev/start 를 실행한다.
// next dev 는 원래 포트를 증가시키지만 next start 는 EADDRINUSE 로 죽는다 → 양쪽 통일.
// 사용: node scripts/run-next.mjs <dev|start>
import net from 'node:net';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// 회사망(Somansa) 프록시가 TLS 를 가로채 자기서명 CA 로 재서명 → Node 가 인증서 거부
// (SELF_SIGNED_CERT_IN_CHAIN). 회사 루트 CA 를 Node 신뢰 체인에 추가한다.
// NODE_EXTRA_CA_CERTS 는 Node 부팅 시 1 회만 읽히므로 .env.local 이 아닌
// next 자식 프로세스를 spawn 하기 전에 env 로 주입해야 적용된다.
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const caPath = path.resolve(scriptDir, '..', 'certs', 'somansa-root-ca.pem');
if (!process.env.NODE_EXTRA_CA_CERTS && existsSync(caPath)) {
  process.env.NODE_EXTRA_CA_CERTS = caPath;
}

const mode = process.argv[2] === 'start' ? 'start' : 'dev';
const basePort = Number(process.env.PORT) || 3000;
const maxTries = 50;

function isFree(port) {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once('error', () => resolve(false));
    srv.once('listening', () => srv.close(() => resolve(true)));
    // 호스트 미지정 → next 와 동일하게 :: (IPv6 dual-stack) 바인딩으로 검사.
    srv.listen(port);
  });
}

async function findFreePort(start) {
  for (let p = start; p < start + maxTries; p++) {
    if (await isFree(p)) return p;
  }
  throw new Error(`사용 가능한 포트를 ${start}~${start + maxTries} 에서 못 찾았습니다.`);
}

const port = await findFreePort(basePort);
if (port !== basePort) {
  console.log(`\n  포트 ${basePort} 사용 중 → ${port} 으로 실행합니다.`);
}
console.log(`\n  ▶ next ${mode}  (http://localhost:${port})\n`);

const args =
  mode === 'start'
    ? ['start', '-p', String(port)]
    : ['dev', '--turbopack', '-p', String(port)];

const child = spawn('next', args, { stdio: 'inherit', shell: true });
child.on('exit', (code) => process.exit(code ?? 0));
