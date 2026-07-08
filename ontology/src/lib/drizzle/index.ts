import * as schema from './schema';

type DrizzleClient = Awaited<ReturnType<typeof createDrizzleClient>>;

async function createDrizzleClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL environment variable is not set');
  }
  const { default: postgres } = await import('postgres');
  const { drizzle } = await import('drizzle-orm/postgres-js');
  // PRD-M 후속(발행 지연): 시드니 pooler 는 연결 수립(TLS)이 ~1s, 웜 쿼리는 ~150ms.
  // keep_alive 로 유휴 끊김(재핸드셰이크)을 막고, 워밍업으로 병렬 쿼리용 커넥션을
  // 미리 열어 Promise.all 이 콜드 연결 비용(~900ms)을 물지 않게 한다.
  const client = postgres(connectionString, {
    prepare: false,
    connect_timeout: 10,
    keep_alive: 30,
  });
  const WARM_CONNECTIONS = 3;
  void Promise.all(
    Array.from({ length: WARM_CONNECTIONS }, () => client`select 1`),
  ).catch(() => {
    // 워밍업 실패는 무해 — 첫 실쿼리가 대신 연결을 연다.
  });
  return drizzle(client, { schema });
}

let _db: DrizzleClient | null = null;

export async function getDb(): Promise<DrizzleClient> {
  if (!_db) {
    _db = await createDrizzleClient();
  }
  return _db;
}

export * from './schema';
