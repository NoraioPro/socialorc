import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedCronRequest } from "@/lib/cron-auth";
import { runDueWorkflows } from "@/lib/socialork/autopilot";

export async function GET(req: NextRequest) {
  if (!isAuthorizedCronRequest(req.headers.get("authorization"), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ ran: await runDueWorkflows() });
}
