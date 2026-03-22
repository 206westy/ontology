import neo4j, { Driver } from 'neo4j-driver';

let _driver: Driver | null = null;

function getEnvOrThrow(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`환경변수 ${key}가 설정되지 않았습니다.`);
  }
  return value;
}

export function getNeo4jDriver(): Driver {
  if (!_driver) {
    const uri = getEnvOrThrow('NEO4J_URI');
    const username = getEnvOrThrow('NEO4J_USERNAME');
    const password = getEnvOrThrow('NEO4J_PASSWORD');
    _driver = neo4j.driver(uri, neo4j.auth.basic(username, password));
  }
  return _driver;
}

export async function verifyNeo4jConnection(): Promise<{
  connected: boolean;
  serverInfo?: { address: string; agent: string };
  error?: string;
}> {
  try {
    const driver = getNeo4jDriver();
    const serverInfo = await driver.getServerInfo();
    return {
      connected: true,
      serverInfo: {
        address: serverInfo.address,
        agent: serverInfo.agent ?? 'unknown',
      },
    };
  } catch (err) {
    return {
      connected: false,
      error: err instanceof Error ? err.message : 'Neo4j 연결에 실패했습니다.',
    };
  }
}

export async function closeNeo4jDriver(): Promise<void> {
  if (_driver) {
    await _driver.close();
    _driver = null;
  }
}
