import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    hasTursoUrl: !!process.env.TURSO_DATABASE_URL,
    tursoUrlPrefix: process.env.TURSO_DATABASE_URL?.slice(0, 20),
    hasTursoToken: !!process.env.TURSO_AUTH_TOKEN,
    hasDatabaseUrl: !!process.env.DATABASE_URL,
    databaseUrlPrefix: process.env.DATABASE_URL?.slice(0, 15),
    nodeEnv: process.env.NODE_ENV,
  });
}
