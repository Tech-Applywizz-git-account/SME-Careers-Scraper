import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  return NextResponse.redirect(new URL("/data/jobs.json", req.url), 307);
}
