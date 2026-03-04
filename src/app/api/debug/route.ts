import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/db";

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

  try {
    const prisma = await getPrisma();
    const count = await prisma.appInstance.count();
    return NextResponse.json({ ...envInfo, dbConnected: true, appCount: count });
  } catch (e: unknown) {
    const error = e as Error;
    return NextResponse.json({
      ...envInfo,
      dbConnected: false,
      error: error.message,
      errorName: error.constructor.name,
    }, { status: 500 });
  }
}
