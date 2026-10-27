import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { isAuthorized, unauthorized } from "@/lib/pin-auth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!isAuthorized(request)) return unauthorized();
  try {
    const { data, error } = await getSupabaseAdmin().from("carriers").select("*").order("name");
    if (error) throw error;
    return Response.json({
      carriers: (data ?? []).map((item) => ({
        id: item.id,
        name: item.name,
        phone: item.phone,
        active: item.active,
      })),
    });
  } catch (error) {
    console.error("Erro ao carregar transportadoras:", error);
    return Response.json({ error: "Erro ao carregar transportadoras." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) return unauthorized();
  try {
    const body = (await request.json()) as { name?: string; phone?: string };
    const name = body.name?.trim();
    if (!name) return Response.json({ error: "Informe o nome da transportadora." }, { status: 400 });
    const { data, error } = await getSupabaseAdmin()
      .from("carriers")
      .insert({ name, phone: body.phone?.trim() ?? "" })
      .select()
      .single();
    if (error) throw error;
    return Response.json({ carrier: data }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao cadastrar transportadora.";
    if (message.includes("duplicate")) {
      return Response.json({ error: "Essa transportadora já está cadastrada." }, { status: 409 });
    }
    console.error("Erro ao cadastrar transportadora:", error);
    return Response.json({ error: "Erro ao cadastrar transportadora." }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  if (!isAuthorized(request)) return unauthorized();
  try {
    const body = (await request.json()) as { id?: number; name?: string; phone?: string };
    const id = Number(body.id);
    const name = body.name?.trim();
    if (!Number.isInteger(id)) return Response.json({ error: "Transportadora inválida." }, { status: 400 });
    if (!name) return Response.json({ error: "Informe o nome da transportadora." }, { status: 400 });
    const { data, error } = await getSupabaseAdmin()
      .from("carriers")
      .update({ name, phone: body.phone?.trim() ?? "" })
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return Response.json({ carrier: data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao atualizar transportadora.";
    if (message.includes("duplicate")) {
      return Response.json({ error: "Essa transportadora já está cadastrada." }, { status: 409 });
    }
    console.error("Erro ao atualizar transportadora:", error);
    return Response.json({ error: "Erro ao atualizar transportadora." }, { status: 500 });
  }
}
export async function DELETE(request: Request) {
  if (!isAuthorized(request)) return unauthorized();
  const id = Number(new URL(request.url).searchParams.get("id"));
  if (!Number.isInteger(id)) return Response.json({ error: "Transportadora inválida." }, { status: 400 });
  const { error } = await getSupabaseAdmin().from("carriers").delete().eq("id", id);
  if (error) {
    console.error("Erro ao excluir transportadora:", error);
    return Response.json({ error: "Erro ao excluir transportadora." }, { status: 500 });
  }
  return Response.json({ ok: true });
}
