import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { isAuthorized, unauthorized } from "@/lib/pin-auth";
import { isExpenseCategory, type ExpenseCategory } from "@/lib/expense-types";

export const runtime = "nodejs";

const EXPENSE_SELECT = "id, category, expense_date, amount, notes, created_at";

type ExpenseRow = {
  id: number;
  category: ExpenseCategory;
  expense_date: string;
  amount: number;
  notes: string;
  created_at: string;
};

type ExpenseInput = {
  category?: ExpenseCategory;
  expenseDate?: string;
  amount?: number | string;
  notes?: string;
};

function mapExpense(item: ExpenseRow) {
  return { id: item.id, category: item.category, expenseDate: item.expense_date, amount: Number(item.amount) || 0, notes: item.notes ?? "", createdAt: item.created_at };
}

function validate(body: ExpenseInput) {
  if (!isExpenseCategory(body.category)) throw new Error("Selecione uma categoria válida.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(body.expenseDate ?? ""))) throw new Error("Informe uma data válida.");
  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Informe um valor de despesa válido.");
}

function payload(body: ExpenseInput) {
  return { category: body.category as ExpenseCategory, expense_date: String(body.expenseDate), amount: Number(body.amount), notes: String(body.notes ?? "").trim() };
}

function errorResponse(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : fallback;
  const clientError = message.includes("Selecione") || message.includes("Informe");
  if (!clientError) console.error(`${fallback}:`, error);
  return Response.json({ error: clientError ? message : fallback }, { status: clientError ? 400 : 500 });
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) return unauthorized();
  try {
    const { data, error } = await getSupabaseAdmin().from("expenses").select(EXPENSE_SELECT).order("expense_date", { ascending: false }).order("id", { ascending: false });
    if (error) throw error;
    return Response.json({ expenses: ((data as ExpenseRow[] | null) ?? []).map(mapExpense) });
  } catch (error) { return errorResponse(error, "Erro ao carregar despesas."); }
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) return unauthorized();
  try {
    const body = await request.json() as ExpenseInput;
    validate(body);
    const { data, error } = await getSupabaseAdmin().from("expenses").insert(payload(body)).select(EXPENSE_SELECT).single();
    if (error) throw error;
    return Response.json({ expense: mapExpense(data as ExpenseRow) }, { status: 201 });
  } catch (error) { return errorResponse(error, "Erro ao salvar despesa."); }
}

export async function PUT(request: Request) {
  if (!isAuthorized(request)) return unauthorized();
  const id = Number(new URL(request.url).searchParams.get("id"));
  if (!Number.isInteger(id)) return Response.json({ error: "Despesa inválida." }, { status: 400 });
  try {
    const body = await request.json() as ExpenseInput;
    validate(body);
    const { data, error } = await getSupabaseAdmin().from("expenses").update(payload(body)).eq("id", id).select(EXPENSE_SELECT).single();
    if (error) throw error;
    return Response.json({ expense: mapExpense(data as ExpenseRow) });
  } catch (error) { return errorResponse(error, "Erro ao atualizar despesa."); }
}

export async function DELETE(request: Request) {
  if (!isAuthorized(request)) return unauthorized();
  const id = Number(new URL(request.url).searchParams.get("id"));
  if (!Number.isInteger(id)) return Response.json({ error: "Despesa inválida." }, { status: 400 });
  const { error } = await getSupabaseAdmin().from("expenses").delete().eq("id", id);
  if (error) {
    console.error("Erro ao excluir despesa:", error);
    return Response.json({ error: "Erro ao excluir despesa." }, { status: 500 });
  }
  return Response.json({ ok: true });
}
