import * as schema from './schema';

type DrizzleClient = Awaited<ReturnType<typeof createDrizzleClient>>;

async function createDrizzleClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL environment variable is not set');
  }
  const { default: postgres } = await import('postgres');
  const { drizzle } = await import('drizzle-orm/postgres-js');
  const client = postgres(connectionString, {
    prepare: false,
    connect_timeout: 10,
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
