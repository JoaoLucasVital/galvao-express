import { clearAccessCookie } from "@/lib/pin-auth";

export async function POST() {
  return Response.json({ ok: true }, { headers: { "Set-Cookie": clearAccessCookie() } });
}
