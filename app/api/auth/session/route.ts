import { createAccessCookie, isAuthorized } from "@/lib/pin-auth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const authenticated = isAuthorized(request);
  return Response.json(
    { authenticated },
    { status: authenticated ? 200 : 401, headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return Response.json(
      { authenticated: false },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  return Response.json(
    { authenticated: true },
    { headers: { "Set-Cookie": createAccessCookie(), "Cache-Control": "no-store" } },
  );
}