export const DRIVER_NAME = process.env.NEXT_PUBLIC_DRIVER_NAME?.trim() || "Motorista Galvão Express";
export const DEFAULT_CARRIER_NAME = "Scarpress - Shopee";

export type EquipmentType = "bitrem_30m" | "carreta_ls";
export type OperationKind = "freight" | "empty_return";
export type CommissionStatus = "recebida";

export const EQUIPMENT_COMMISSION_PERCENT: Record<EquipmentType, number> = {
  bitrem_30m: 13,
  carreta_ls: 15,
};

export const EQUIPMENT_LABEL: Record<EquipmentType, string> = {
  bitrem_30m: "Bitrem 30 metros",
  carreta_ls: "Carreta LS",
};

export type Carrier = {
  id: number;
  name: string;
  phone: string;
  active: boolean;
};

export type Freight = {
  id: number;
  carrierId: number | null;
  carrierName: string | null;
  cteNumber: string;
  type: "Frete";
  origin: string;
  destination: string;
  freightValue: number;
  commissionPercent: number;
  commissionValue: number;
  emptyReturnAmount: number;
  notes: string;
  freightDate: string;
  status: string;
  commissionStatus: CommissionStatus;
  equipmentType: EquipmentType;
  operationKind: OperationKind;
  loadingAt: string;
};

export type FreightDraft = {
  carrierId: string;
  cteNumber: string;
  type: "Frete";
  origin: string;
  destination: string;
  freightValue: string;
  emptyReturnAmount: string;
  notes: string;
  freightDate: string;
  status: string;
  commissionStatus: CommissionStatus;
  equipmentType: EquipmentType;
  operationKind: OperationKind;
  loadingAt: string;
};

export function commissionPercentFor(equipmentType: EquipmentType) {
  return EQUIPMENT_COMMISSION_PERCENT[equipmentType];
}

export function calculateCommission(freightValue: number, equipmentType: EquipmentType) {
  if (!Number.isFinite(freightValue) || freightValue <= 0) return 0;
  return Math.round((freightValue * commissionPercentFor(equipmentType) / 100) * 100) / 100;
}

export function calculateIncome(
  operationKind: OperationKind,
  freightValue: number,
  equipmentType: EquipmentType,
  emptyReturnAmount = 0,
) {
  if (operationKind === "empty_return") {
    return Number.isFinite(emptyReturnAmount) && emptyReturnAmount > 0 ? emptyReturnAmount : 0;
  }
  return calculateCommission(freightValue, equipmentType);
}

export function normalizeFreight(
  freight: Partial<Freight> & Pick<Freight, "id" | "origin" | "destination" | "freightDate">,
): Freight {
  const freightValue = Number(freight.freightValue) || 0;
  const equipmentType: EquipmentType = freight.equipmentType === "bitrem_30m" ? "bitrem_30m" : "carreta_ls";
  const operationKind: OperationKind = freight.operationKind === "empty_return" ? "empty_return" : "freight";
  const emptyReturnAmount = operationKind === "empty_return" ? Math.max(0, Number(freight.emptyReturnAmount) || 0) : 0;
  return {
    id: freight.id,
    carrierId: freight.carrierId ?? null,
    carrierName: freight.carrierName ?? null,
    cteNumber: freight.cteNumber ?? "",
    type: "Frete",
    origin: freight.origin,
    destination: freight.destination,
    freightValue,
    commissionPercent: commissionPercentFor(equipmentType),
    commissionValue: calculateIncome(operationKind, freightValue, equipmentType, emptyReturnAmount),
    emptyReturnAmount,
    notes: freight.notes ?? "",
    freightDate: freight.freightDate,
    status: freight.status ?? "concluido",
    commissionStatus: "recebida",
    equipmentType,
    operationKind,
    loadingAt: freight.loadingAt ?? `${freight.freightDate}T12:00`,
  };
}
