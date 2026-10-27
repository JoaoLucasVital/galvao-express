import { createAccessCookie, pinMatches } from "@/lib/pin-auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { pin?: string };
    if (!body.pin || !pinMatches(body.pin)) {
      return Response.json({ error: "PIN incorreto." }, { status: 401 });
    }
    return Response.json(
      { ok: true },
      { headers: { "Set-Cookie": createAccessCookie(), "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json({ error: "Não foi possível validar o PIN." }, { status: 500 });
  }
}
