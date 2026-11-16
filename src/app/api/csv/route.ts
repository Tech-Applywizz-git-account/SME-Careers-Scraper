import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Prefer the static CSV Vercel serves from /public/data */
export async function GET(req: NextRequest) {
  return NextResponse.redirect(new URL("/data/jobs.csv", req.url), 307);
}
