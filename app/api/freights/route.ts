import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { isAuthorized, unauthorized } from "@/lib/pin-auth";
import {
  calculateCommission,
  commissionPercentFor,
  type CommissionStatus,
  type EquipmentType,
  type OperationKind,
} from "@/lib/freight-types";

export const runtime = "nodejs";

const FREIGHT_SELECT = "id, carrier_id, cte_number, type, origin, destination, freight_value, commission_percent, commission_value, empty_return_amount, notes, freight_date, status, commission_status, equipment_type, operation_kind, loading_at, carriers(name)";
const LEGACY_FREIGHT_SELECT = "id, carrier_id, cte_number, type, origin, destination, freight_value, commission_percent, commission_value, notes, freight_date, status, commission_status, equipment_type, operation_kind, loading_at, carriers(name)";

type FreightRow = {
  id: number;
  carrier_id: number | null;
  carriers: { name: string } | { name: string }[] | null;
  cte_number: string;
  type: string;
  origin: string;
  destination: string;
  freight_value: number;
  commission_percent: number;
  commission_value: number;
  empty_return_amount?: number;
  notes: string;
  freight_date: string;
  status: string;
  commission_status: CommissionStatus;
  equipment_type: EquipmentType;
  operation_kind: OperationKind;
  loading_at: string;
};

type FreightInput = {
  carrierId?: string | number | null;
  cteNumber?: string;
  origin?: string;
  destination?: string;
  freightValue?: string | number;
  emptyReturnAmount?: string | number;
  notes?: string;
  freightDate?: string;
  status?: string;
  equipmentType?: EquipmentType;
  operationKind?: OperationKind;
  loadingAt?: string;
};

function carrierName(value: FreightRow["carriers"]) {
  return Array.isArray(value) ? value[0]?.name ?? null : value?.name ?? null;
}

function mapFreight(item: FreightRow) {
  const freightValue = Number(item.freight_value) || 0;
  const equipmentType: EquipmentType = item.equipment_type === "bitrem_30m" ? "bitrem_30m" : "carreta_ls";
  const operationKind: OperationKind = item.operation_kind === "empty_return" ? "empty_return" : "freight";
  const emptyReturnAmount = Number(item.empty_return_amount) || 0;
  return {
    id: item.id,
    carrierId: item.carrier_id,
    carrierName: carrierName(item.carriers),
    cteNumber: item.cte_number ?? "",
    type: "Frete" as const,
    origin: item.origin,
    destination: item.destination,
    freightValue,
    commissionPercent: Number(item.commission_percent) || commissionPercentFor(equipmentType),
    commissionValue: operationKind === "empty_return"
      ? emptyReturnAmount
      : item.commission_value == null ? calculateCommission(freightValue, equipmentType) : Number(item.commission_value),
    emptyReturnAmount,
    notes: item.notes ?? "",
    freightDate: item.freight_date,
    status: item.status,
    commissionStatus: "recebida" as const,
    equipmentType,
    operationKind,
    loadingAt: item.loading_at ?? `${item.freight_date}T12:00`,
  };
}

function validate(body: FreightInput) {
  if ([body.origin, body.destination, body.freightDate, body.loadingAt].some((value) => !String(value ?? "").trim())) throw new Error("Preencha os campos obrigatórios.");
  const carrierId = Number(body.carrierId);
  if (!Number.isInteger(carrierId) || carrierId <= 0) throw new Error("Selecione uma transportadora válida.");
  if (body.equipmentType !== "bitrem_30m" && body.equipmentType !== "carreta_ls") throw new Error("Selecione uma carreta válida.");
  if (body.operationKind !== "freight" && body.operationKind !== "empty_return") throw new Error("Selecione uma modalidade válida.");
  if (body.operationKind === "freight") {
    const freightValue = Number(body.freightValue);
    if (!Number.isFinite(freightValue) || freightValue <= 0) throw new Error("Informe um valor de frete válido.");
  } else {
    const emptyReturnAmount = Number(body.emptyReturnAmount);
    if (!Number.isFinite(emptyReturnAmount) || emptyReturnAmount <= 0) throw new Error("Informe o valor da volta vazia.");
  }
}

function payload(body: FreightInput) {
  const equipmentType = body.equipmentType as EquipmentType;
  const operationKind = body.operationKind as OperationKind;
  const freightValue = operationKind === "empty_return" ? 0 : Number(body.freightValue);
  const emptyReturnAmount = operationKind === "empty_return" ? Number(body.emptyReturnAmount) : 0;
  return {
    carrier_id: Number(body.carrierId),
    cte_number: String(body.cteNumber ?? "").trim(),
    type: "Frete",
    origin: String(body.origin).trim(),
    destination: String(body.destination).trim(),
    freight_value: freightValue,
    commission_percent: commissionPercentFor(equipmentType),
    empty_return_amount: emptyReturnAmount,
    notes: String(body.notes ?? "").trim(),
    freight_date: String(body.freightDate),
    status: String(body.status || "concluido"),
    commission_status: "recebida",
    equipment_type: equipmentType,
    operation_kind: operationKind,
    loading_at: String(body.loadingAt),
  };
}

function errorResponse(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : fallback;
  const clientError = message.includes("Preencha") || message.includes("válid") || message.includes("Selecione") || message.includes("Informe");
  if (!clientError) console.error(`${fallback}:`, error);
  return Response.json({ error: clientError ? message : fallback }, { status: clientError ? 400 : 500 });
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) return unauthorized();
  try {
    const supabase = getSupabaseAdmin();
    const primary = await supabase.from("freights").select(FREIGHT_SELECT).order("freight_date", { ascending: false }).order("loading_at", { ascending: false }).order("id", { ascending: false });
    let data: unknown = primary.data;
    let queryError = primary.error;
    if (queryError && queryError.message.includes("empty_return_amount")) {
      const legacy = await supabase.from("freights").select(LEGACY_FREIGHT_SELECT).order("freight_date", { ascending: false }).order("loading_at", { ascending: false }).order("id", { ascending: false });
      data = legacy.data;
      queryError = legacy.error;
    }
    if (queryError) throw queryError;
    return Response.json({ freights: (((data as FreightRow[] | null) ?? []).map(mapFreight)) });
  } catch (error) { return errorResponse(error, "Erro ao carregar fretes."); }
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) return unauthorized();
  try {
    const body = await request.json() as FreightInput;
    validate(body);
    const { data, error } = await getSupabaseAdmin().from("freights").insert(payload(body)).select(FREIGHT_SELECT).single();
    if (error) throw error;
    return Response.json({ freight: mapFreight(data as unknown as FreightRow) }, { status: 201 });
  } catch (error) { return errorResponse(error, "Erro ao salvar frete."); }
}

export async function PUT(request: Request) {
  if (!isAuthorized(request)) return unauthorized();
  const id = Number(new URL(request.url).searchParams.get("id"));
  if (!Number.isInteger(id)) return Response.json({ error: "Frete inválido." }, { status: 400 });
  try {
    const body = await request.json() as FreightInput;
    validate(body);
    const { data, error } = await getSupabaseAdmin().from("freights").update({ ...payload(body), updated_at: new Date().toISOString() }).eq("id", id).select(FREIGHT_SELECT).single();
    if (error) throw error;
    return Response.json({ freight: mapFreight(data as unknown as FreightRow) });
  } catch (error) { return errorResponse(error, "Erro ao atualizar frete."); }
}

export async function DELETE(request: Request) {
  if (!isAuthorized(request)) return unauthorized();
  const id = Number(new URL(request.url).searchParams.get("id"));
  if (!Number.isInteger(id)) return Response.json({ error: "Frete inválido." }, { status: 400 });
  const { error } = await getSupabaseAdmin().from("freights").delete().eq("id", id);
  if (error) {
    console.error("Erro ao excluir frete:", error);
    return Response.json({ error: "Erro ao excluir frete." }, { status: 500 });
  }
  return Response.json({ ok: true });
}
