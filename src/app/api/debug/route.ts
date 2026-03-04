import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const envInfo = {
    hasTursoUrl: !!process.env.TURSO_DATABASE_URL,
    tursoUrlPrefix: process.env.TURSO_DATABASE_URL?.slice(0, 30),
    tursoUrlLength: process.env.TURSO_DATABASE_URL?.length,
    hasTursoToken: !!process.env.TURSO_AUTH_TOKEN,
    tursoTokenLength: process.env.TURSO_AUTH_TOKEN?.length,
    hasDatabaseUrl: !!process.env.DATABASE_URL,
    databaseUrl: process.env.DATABASE_URL,
    nodeEnv: process.env.NODE_ENV,
  };

  // Test 1: Raw libSQL client connection
  try {
    const { createClient } = await import("@libsql/client");
    const client = createClient({
      url: process.env.TURSO_DATABASE_URL!,
      authToken: process.env.TURSO_AUTH_TOKEN!,
    });
    const result = await client.execute("SELECT COUNT(*) as cnt FROM AppInstance");
    return NextResponse.json({
      ...envInfo,
      rawLibsqlConnected: true,
      count: result.rows[0]?.cnt,
    });
  } catch (e: unknown) {
    const error = e as Error;
    return NextResponse.json({
      ...envInfo,
      rawLibsqlConnected: false,
      rawError: error.message,
      rawErrorStack: error.stack?.split("\n").slice(0, 5),
    }, { status: 500 });
  }
}
