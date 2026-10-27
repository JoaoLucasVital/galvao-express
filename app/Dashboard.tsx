"use client";

import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Building2,
  CalendarDays,
  CalendarRange,
  Check,
  ChevronRight,
  CircleDollarSign,
  ClipboardList,
  Edit3,
  ReceiptText,
  FileDown,
  FileSpreadsheet,
  LayoutDashboard,
  LogOut,
  MapPin,
  PackageCheck,
  Percent,
  Plus,
  RefreshCw,
  Route,
  Search,
  Trash2,
  Truck,
  WalletCards,
  X,
  Zap,
} from "lucide-react";
import { AnimatePresence, animate, useDragControls, useMotionValue, useMotionValueEvent, useReducedMotion, useScroll, useSpring } from "motion/react";
import * as m from "motion/react-m";
import {
  type CSSProperties,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type TouchEvent as ReactTouchEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  calculateIncome,
  commissionPercentFor,
  DEFAULT_CARRIER_NAME,
  EQUIPMENT_LABEL,
  normalizeFreight,
  type Carrier,
  type EquipmentType,
  type Freight,
  type FreightDraft,
} from "@/lib/freight-types";
import { exportFreightsPdf, exportFreightsXlsx, reportTotals } from "@/lib/report-export";
import ThemeToggle from "./ThemeToggle";
import ExpensesModule from "./ExpensesModule";

type Tab = "dashboard" | "freights" | "expenses" | "reports" | "carriers";
type DataMode = "remote" | "local";

const LOCAL_FREIGHTS_KEY = "galvao-express-freights-v3";
const LOCAL_CARRIERS_KEY = "galvao-express-carriers-v2";
const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const compactMoney = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  notation: "compact",
  maximumFractionDigits: 1,
});
const fullDate = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "2-digit", month: "long" });
const formatMoneyValue = (value: number) => money.format(value);
const formatIntegerValue = (value: number) => String(Math.round(value));

const TAB_ORDER: Tab[] = ["dashboard", "freights", "expenses", "reports", "carriers"];
const PULL_REFRESH_THRESHOLD = 72;

function localDate() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function localDateTime() {
  const now = new Date();
  return localDate() + "T" + String(now.getHours()).padStart(2, "0") + ":" + String(now.getMinutes()).padStart(2, "0");
}

function formatLoadingAt(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Não informado";
  return parsed.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function monthKey(offset = 0) {
  const now = new Date();
  const date = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function monthRange() {
  const now = new Date();
  const start = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return { start, end: `${endDate.getFullYear()}-${String(endDate.getMonth() + 1).padStart(2, "0")}-${String(endDate.getDate()).padStart(2, "0")}` };
}

function emptyDraft(carrierId = ""): FreightDraft {
  return {
    carrierId,
    cteNumber: "",
    type: "Frete",
    origin: "",
    destination: "",
    freightValue: "",
    emptyReturnAmount: "",
    notes: "",
    freightDate: localDate(),
    status: "concluido",
    commissionStatus: "recebida",
    equipmentType: "carreta_ls",
    operationKind: "freight",
    loadingAt: localDateTime(),
  };
}

function freightToDraft(item: Freight): FreightDraft {
  return {
    carrierId: item.carrierId == null ? "" : String(item.carrierId),
    cteNumber: item.cteNumber,
    type: "Frete",
    origin: item.origin,
    destination: item.destination,
    freightValue: formatCurrencyInput(String(Math.round(item.freightValue * 100))),
    emptyReturnAmount: formatCurrencyInput(String(Math.round(item.emptyReturnAmount * 100))),
    notes: item.notes,
    freightDate: item.freightDate,
    status: item.status,
    commissionStatus: "recebida",
    equipmentType: item.equipmentType,
    operationKind: item.operationKind,
    loadingAt: item.loadingAt,
  };
}

function readLocal<T>(key: string, fallback: T): T {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) as T : fallback;
  } catch {
    return fallback;
  }
}

function formatCurrencyInput(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits ? money.format(Number(digits) / 100) : "";
}

function parseCurrencyInput(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits ? Number(digits) / 100 : 0;
}

function statusLabel(status: string) {
  const normalized = status.toLocaleLowerCase("pt-BR");
  if (normalized.includes("concl")) return "Concluído";
  if (normalized.includes("cancel")) return "Cancelado";
  return "Pendente";
}


function freightLabel(item: Freight) {
  if (item.operationKind === "empty_return") return `Volta vazia para ${item.destination}`;
  return item.cteNumber ? `CT-e ${item.cteNumber}` : `Frete para ${item.destination}`;
}

export default function Dashboard() {
  const [tab, setTab] = useState<Tab>("dashboard");
  const [carriers, setCarriers] = useState<Carrier[]>([]);
  const [freights, setFreights] = useState<Freight[]>([]);
  const [dataMode, setDataMode] = useState<DataMode>("remote");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [freightModal, setFreightModal] = useState(false);
  const [carrierModal, setCarrierModal] = useState(false);
  const [editingCarrier, setEditingCarrier] = useState<Carrier | null>(null);
  const [detailsFreight, setDetailsFreight] = useState<Freight | null>(null);
  const [editingFreight, setEditingFreight] = useState<Freight | null>(null);
  const [draft, setDraft] = useState<FreightDraft>(() => emptyDraft());
  const [toast, setToast] = useState("");
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState("");
  const [reportStart, setReportStart] = useState(() => monthRange().start);
  const [reportEnd, setReportEnd] = useState(() => monthRange().end);
  const [reportGenerated, setReportGenerated] = useState(false);
  const [exporting, setExporting] = useState<"pdf" | "xlsx" | null>(null);
  const [bottomNavHidden, setBottomNavHidden] = useState(false);
  const [saveConfirmed, setSaveConfirmed] = useState(false);
  const [highlightedFreightId, setHighlightedFreightId] = useState<number | null>(null);
  const [quickActionsOpen, setQuickActionsOpen] = useState(false);
  const [expenseOpenRequest, setExpenseOpenRequest] = useState(0);
  const [expenseSummary, setExpenseSummary] = useState({ total: 0, count: 0 });
  const [pageDirection, setPageDirection] = useState(1);
  const [pullDistance, setPullDistance] = useState(0);
  const pullStartYRef = useRef<number | null>(null);
  const { scrollY } = useScroll();

  useMotionValueEvent(scrollY, "change", (latest) => {
    const previous = scrollY.getPrevious() ?? latest;
    if (latest < 72) {
      setBottomNavHidden(false);
      return;
    }
    if (latest > previous + 3) setBottomNavHidden(true);
    else if (latest < previous - 3) setBottomNavHidden(false);
  });

  async function load(background = false) {
    if (background) setRefreshing(true);
    else setLoading(true);
    try {
      const [carrierResponse, freightResponse] = await Promise.all([
        fetch("/api/carriers", { cache: "no-store" }),
        fetch("/api/freights", { cache: "no-store" }),
      ]);
      const carrierData = await carrierResponse.json();
      const freightData = await freightResponse.json();
      if (!carrierResponse.ok) throw new Error(carrierData.error);
      if (!freightResponse.ok) throw new Error(freightData.error);
      const remoteCarriers = carrierData.carriers as Carrier[];
      const remoteFreights = (freightData.freights as Freight[]).map(normalizeFreight);
      if (process.env.NODE_ENV === "development") {
        const localCarrierSeed = localStorage.getItem(LOCAL_CARRIERS_KEY) ? readLocal<Carrier[]>(LOCAL_CARRIERS_KEY, remoteCarriers) : remoteCarriers;
        const localFreightSeed = localStorage.getItem(LOCAL_FREIGHTS_KEY) ? readLocal<Freight[]>(LOCAL_FREIGHTS_KEY, remoteFreights).map(normalizeFreight) : remoteFreights;
        setCarriers(localCarrierSeed);
        setFreights(localFreightSeed);
        localStorage.setItem(LOCAL_CARRIERS_KEY, JSON.stringify(localCarrierSeed));
        localStorage.setItem(LOCAL_FREIGHTS_KEY, JSON.stringify(localFreightSeed));
        setDataMode("local");
      } else {
        setCarriers(remoteCarriers);
        setFreights(remoteFreights);
        setDataMode("remote");
      }
    } catch {
      const defaultCarrier: Carrier = { id: 1, name: DEFAULT_CARRIER_NAME, phone: "", active: true };
      const localCarriers = readLocal<Carrier[]>(LOCAL_CARRIERS_KEY, [defaultCarrier]).map((carrier) =>
        carrier.name === "Maranhão Transportes" ? { ...carrier, name: DEFAULT_CARRIER_NAME, active: true } : carrier
      );
      const localFreights = readLocal<Freight[]>(LOCAL_FREIGHTS_KEY, [])
        .map(normalizeFreight)
        .map((freight) => freight.carrierName === "Maranhão Transportes" ? { ...freight, carrierName: DEFAULT_CARRIER_NAME } : freight);
      const migratedCarriers = localCarriers.length ? localCarriers : [defaultCarrier];
      setCarriers(migratedCarriers);
      setFreights(localFreights);
      localStorage.setItem(LOCAL_CARRIERS_KEY, JSON.stringify(migratedCarriers));
      localStorage.setItem(LOCAL_FREIGHTS_KEY, JSON.stringify(localFreights));
      setDataMode("local");
      setToast("Modo local ativo. Os registros ficam salvos neste aparelho até a conexão com o Supabase voltar.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 5200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setFreightModal(false);
        setCarrierModal(false);
        setDetailsFreight(null);
        setQuickActionsOpen(false);
      }
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, []);

  const analytics = useMemo(() => {
    const freightTotal = freights.reduce((sum, item) => sum + item.freightValue, 0);
    const commissionTotal = freights.reduce((sum, item) => sum + item.commissionValue, 0);
    const commissionReceived = commissionTotal;
    const currentMonth = freights
      .filter((item) => item.freightDate.startsWith(monthKey()))
      .reduce((sum, item) => sum + item.commissionValue, 0);
    const previousMonth = freights
      .filter((item) => item.freightDate.startsWith(monthKey(-1)))
      .reduce((sum, item) => sum + item.commissionValue, 0);
    const change = previousMonth > 0 ? ((currentMonth - previousMonth) / previousMonth) * 100 : null;
    return {
      freightTotal,
      commissionTotal,
      commissionReceived,
      currentMonth,
      previousMonth,
      change,
      averageCommission: freights.length ? commissionTotal / freights.length : 0,
      thisMonthCount: freights.filter((item) => item.freightDate.startsWith(monthKey())).length,
      completedCount: freights.filter((item) => item.status === "concluido").length,
      pendingCount: freights.filter((item) => item.status === "pendente").length,
      cancelledCount: freights.filter((item) => item.status === "cancelado").length,
    };
  }, [freights]);

  const chart = useMemo(() => {
    const labels: { key: string; label: string; value: number }[] = [];
    const now = new Date();
    for (let offset = 5; offset >= 0; offset--) {
      const date = new Date(now.getFullYear(), now.getMonth() - offset, 1);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      labels.push({
        key,
        label: date.toLocaleDateString("pt-BR", { month: "short" }).replace(".", ""),
        value: freights
          .filter((item) => item.freightDate.startsWith(key))
          .reduce((sum, item) => sum + item.commissionValue, 0),
      });
    }
    return labels;
  }, [freights]);

  const statusDistribution = useMemo(() => [
    { label: "Concluídos", value: analytics.completedCount },
    { label: "Pendentes", value: analytics.pendingCount },
    { label: "Cancelados", value: analytics.cancelledCount },
  ].filter((item) => item.value > 0), [analytics]);

  const filteredFreights = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("pt-BR");
    return freights.filter((item) => !normalized || [
      item.cteNumber,
      item.origin,
      item.destination,
      item.carrierName ?? "",
    ].some((value) => value.toLocaleLowerCase("pt-BR").includes(normalized)));
  }, [freights, query]);

  const reportFreights = useMemo(() => {
    if (!reportGenerated) return [];
    return freights.filter((item) => item.freightDate >= reportStart && item.freightDate <= reportEnd);
  }, [freights, reportEnd, reportGenerated, reportStart]);
  const reportSummary = useMemo(() => reportTotals(reportFreights), [reportFreights]);
  const reportDaily = useMemo(() => {
    const grouped = new Map<string, { date: string; commission: number; count: number }>();
    for (const item of reportFreights) {
      const current = grouped.get(item.freightDate) ?? { date: item.freightDate, commission: 0, count: 0 };
      current.commission += item.commissionValue;
      current.count += 1;
      grouped.set(item.freightDate, current);
    }
    return Array.from(grouped.values()).sort((a, b) => a.date.localeCompare(b.date));
  }, [reportFreights]);
  const maxStatus = Math.max(...statusDistribution.map((item) => item.value), 1);
  const activeFilters = query ? 1 : 0;
  const draftFreightValue = parseCurrencyInput(draft.freightValue);
  const draftEmptyReturnAmount = parseCurrencyInput(draft.emptyReturnAmount);
  const draftCommissionPercent = commissionPercentFor(draft.equipmentType);
  const draftCommission = calculateIncome(draft.operationKind, draftFreightValue, draft.equipmentType, draftEmptyReturnAmount);
  const monthBalance = analytics.currentMonth - expenseSummary.total;
  const handleExpenseSummary = useCallback((summary: { total: number; count: number }) => setExpenseSummary(summary), []);
  const handleExpenseToast = useCallback((message: string) => setToast(message), []);

  function openNewExpense() {
    setExpenseOpenRequest((current) => current + 1);
  }

  function defaultCarrierId() {
    const preferred = carriers.find((item) => item.name === DEFAULT_CARRIER_NAME && item.active);
    return String(preferred?.id ?? carriers.find((item) => item.active)?.id ?? "");
  }

  function updateDraft<K extends keyof FreightDraft>(key: K, value: FreightDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function openNewFreight() {
    setSaveConfirmed(false);
    setEditingFreight(null);
    setDraft(emptyDraft(defaultCarrierId()));
    setFreightModal(true);
  }

  function openEditFreight(item: Freight) {
    setSaveConfirmed(false);
    setDetailsFreight(null);
    setEditingFreight(item);
    setDraft(freightToDraft(item));
    setFreightModal(true);
  }

  function saveLocalFreights(next: Freight[]) {
    setFreights(next);
    localStorage.setItem(LOCAL_FREIGHTS_KEY, JSON.stringify(next));
  }

  async function saveFreight(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaveConfirmed(false);
    setSaving(true);
    try {
      const freightValue = parseCurrencyInput(draft.freightValue);
      const emptyReturnAmount = parseCurrencyInput(draft.emptyReturnAmount);
      if (!draft.carrierId || !draft.origin.trim() || !draft.destination.trim() || !draft.loadingAt) throw new Error("Preencha os campos obrigatórios.");
      if (draft.operationKind === "freight" && (!Number.isFinite(freightValue) || freightValue <= 0)) throw new Error("Informe um valor de frete válido.");
      if (draft.operationKind === "empty_return" && (!Number.isFinite(emptyReturnAmount) || emptyReturnAmount <= 0)) throw new Error("Informe o valor da volta vazia.");
      const storedFreightValue = draft.operationKind === "empty_return" ? 0 : freightValue;
      const storedEmptyReturnAmount = draft.operationKind === "empty_return" ? emptyReturnAmount : 0;
      const payload = {
        ...draft,
        type: "Frete",
        freightDate: draft.loadingAt.slice(0, 10),
        freightValue: storedFreightValue,
        emptyReturnAmount: storedEmptyReturnAmount,
        commissionStatus: "recebida" as const,
      };
      let saved: Freight;
      if (dataMode === "local") {
        const carrierId = Number(payload.carrierId);
        const item = normalizeFreight({
          id: editingFreight?.id ?? Math.max(0, ...freights.map((freight) => freight.id)) + 1,
          carrierId,
          carrierName: carriers.find((carrier) => carrier.id === carrierId)?.name ?? null,
          cteNumber: payload.cteNumber.trim(),
          type: "Frete",
          origin: payload.origin.trim(),
          destination: payload.destination.trim(),
          freightValue: storedFreightValue,
          commissionPercent: commissionPercentFor(payload.equipmentType),
          commissionValue: calculateIncome(payload.operationKind, storedFreightValue, payload.equipmentType, storedEmptyReturnAmount),
          emptyReturnAmount: storedEmptyReturnAmount,
          notes: payload.notes.trim(),
          freightDate: payload.freightDate,
          status: payload.status,
          commissionStatus: "recebida",
          equipmentType: payload.equipmentType,
          operationKind: payload.operationKind,
          loadingAt: payload.loadingAt,
        });
        const next = editingFreight
          ? freights.map((freight) => freight.id === editingFreight.id ? item : freight)
          : [item, ...freights];
        saveLocalFreights(next);
        saved = item;
      } else {
        const endpoint = editingFreight ? `/api/freights?id=${editingFreight.id}` : "/api/freights";
        const response = await fetch(endpoint, {
          method: editingFreight ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error);
        saved = normalizeFreight(result.freight as Freight);
        await load(true);
      }
      const successMessage = editingFreight ? "Frete atualizado com sucesso." : "Frete salvo com sucesso.";
      setSaveConfirmed(true);
      await new Promise<void>((resolve) => window.setTimeout(resolve, 420));
      setFreightModal(false);
      setEditingFreight(null);
      setDetailsFreight(null);
      setTab("freights");
      setBottomNavHidden(false);
      setHighlightedFreightId(saved.id);
      setToast(successMessage);
      window.requestAnimationFrame(() => {
        window.setTimeout(() => document.querySelector(`[data-freight-id="${saved.id}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 80);
      });
      window.setTimeout(() => setHighlightedFreightId((current) => current === saved.id ? null : current), 2200);
    } catch (error) {
      setSaveConfirmed(false);
      setToast(error instanceof Error ? error.message : "Erro ao salvar frete.");
    } finally {
      setSaving(false);
    }
  }
  function openNewCarrier() {
    setEditingCarrier(null);
    setCarrierModal(true);
  }

  function openEditCarrier(carrier: Carrier) {
    setEditingCarrier(carrier);
    setCarrierModal(true);
  }

  function closeCarrierModal() {
    setCarrierModal(false);
    setEditingCarrier(null);
  }

  async function saveCarrier(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    const data = Object.fromEntries(new FormData(event.currentTarget));
    const name = String(data.name ?? "").trim();
    const phone = String(data.phone ?? "").trim();
    const editingId = editingCarrier?.id ?? null;
    try {
      if (!name) throw new Error("Informe o nome da transportadora.");
      if (carriers.some((carrier) => carrier.id !== editingId && carrier.name.toLocaleLowerCase("pt-BR") === name.toLocaleLowerCase("pt-BR"))) {
        throw new Error("Essa transportadora já está cadastrada.");
      }
      if (dataMode === "local") {
        const next = editingCarrier
          ? carriers.map((carrier) => carrier.id === editingCarrier.id ? { ...carrier, name, phone } : carrier)
          : [...carriers, { id: Math.max(0, ...carriers.map((carrier) => carrier.id)) + 1, name, phone, active: true }];
        const sorted = next.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
        setCarriers(sorted);
        localStorage.setItem(LOCAL_CARRIERS_KEY, JSON.stringify(sorted));
      } else {
        const response = await fetch("/api/carriers", {
          method: editingCarrier ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: editingCarrier?.id, name, phone }),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error);
        await load(true);
      }
      closeCarrierModal();
      setToast(editingCarrier ? "Transportadora atualizada." : "Transportadora cadastrada.");
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Erro ao salvar transportadora.");
    } finally {
      setSaving(false);
    }
  }

  async function remove(kind: "freights" | "carriers", id: number) {
    const label = kind === "freights" ? "este frete" : "esta transportadora";
    if (!window.confirm(`Deseja realmente excluir ${label}?`)) return;
    if (dataMode === "local") {
      if (kind === "freights") {
        saveLocalFreights(freights.filter((item) => item.id !== id));
        if (detailsFreight?.id === id) setDetailsFreight(null);
      } else {
        const next = carriers.filter((item) => item.id !== id);
        setCarriers(next);
        localStorage.setItem(LOCAL_CARRIERS_KEY, JSON.stringify(next));
      }
      setToast("Registro excluído.");
      return;
    }
    const response = await fetch(`/api/${kind}?id=${id}`, { method: "DELETE" });
    if (response.ok) {
      if (kind === "freights") setFreights((current) => current.filter((item) => item.id !== id));
      else setCarriers((current) => current.filter((item) => item.id !== id));
      setToast("Registro excluído com sucesso.");
      setDetailsFreight(null);
    } else {
      const result = await response.json().catch(() => ({}));
      setToast(result.error ?? "Não foi possível excluir.");
    }
  }

  async function logout() {
    window.localStorage.removeItem("galvao-express-last-activity");
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.reload();
  }

  function navigate(next: Tab) {
    if (next !== tab) {
      setPageDirection(TAB_ORDER.indexOf(next) > TAB_ORDER.indexOf(tab) ? 1 : -1);
      setTab(next);
    }
    setQuickActionsOpen(false);
    window.scrollTo({ top: 0, behavior: "auto" });
  }

  function runQuickAction(action: "freight" | "expense" | "carrier" | "report") {
    setQuickActionsOpen(false);
    if (navigator.vibrate) navigator.vibrate(10);
    if (action === "freight") {
      openNewFreight();
      return;
    }
    if (action === "expense") {
      navigate("expenses");
      openNewExpense();
      return;
    }
    if (action === "carrier") {
      openNewCarrier();
      return;
    }
    navigate("reports");
  }

  function handlePullStart(event: ReactTouchEvent<HTMLElement>) {
    if (window.scrollY > 0 || refreshing || freightModal || detailsFreight || carrierModal || quickActionsOpen) return;
    pullStartYRef.current = event.touches[0]?.clientY ?? null;
  }

  function handlePullMove(event: ReactTouchEvent<HTMLElement>) {
    if (pullStartYRef.current === null) return;
    const currentY = event.touches[0]?.clientY ?? pullStartYRef.current;
    const delta = currentY - pullStartYRef.current;
    if (delta <= 0) {
      setPullDistance(0);
      return;
    }
    setPullDistance(Math.min(96, delta * .46));
  }

  function handlePullEnd(event: ReactTouchEvent<HTMLElement>) {
    if (pullStartYRef.current === null) return;
    const releaseY = event.changedTouches[0]?.clientY ?? pullStartYRef.current;
    const dragged = Math.min(96, Math.max(0, releaseY - pullStartYRef.current) * .46);
    pullStartYRef.current = null;
    setPullDistance(0);
    if (dragged < PULL_REFRESH_THRESHOLD || refreshing) return;
    if (navigator.vibrate) navigator.vibrate(14);
    void load(true);
  }

  function clearFilters() {
    setQuery("");
  }

  function generateReport() {
    if (!reportStart || !reportEnd) {
      setToast("Informe a data inicial e a data final.");
      return;
    }
    if (reportStart > reportEnd) {
      setToast("A data inicial não pode ser posterior à data final.");
      return;
    }
    setReportGenerated(true);
    setToast("Relatório gerado com os dados do período.");
  }

  async function exportReport(kind: "pdf" | "xlsx") {
    if (!reportFreights.length) return;
    setExporting(kind);
    try {
      if (kind === "pdf") await exportFreightsPdf(reportFreights, reportStart, reportEnd);
      else await exportFreightsXlsx(reportFreights, reportStart, reportEnd);
      setToast(kind === "pdf" ? "PDF gerado com sucesso." : "Planilha Excel gerada com sucesso.");
    } catch {
      setToast("Não foi possível gerar o arquivo. Tente novamente.");
    } finally {
      setExporting(null);
    }
  }

  const pageTitle = tab === "dashboard" ? "Controle financeiro" : tab === "freights" ? "Fretes" : tab === "expenses" ? "Despesas" : tab === "reports" ? "Relatórios" : "Transportadoras";
  const pageCopy = tab === "dashboard"
    ? "Acompanhe entradas, despesas e o saldo real do mês."
    : tab === "freights"
      ? "Consulte e registre os fretes realizados."
      : tab === "expenses"
        ? "Registre os gastos do dia e acompanhe suas saídas."
      : tab === "reports"
        ? "Confira e exporte suas comissões por período."
        : "Organize as transportadoras vinculadas aos seus fretes.";
  const hideMobileNav = bottomNavHidden && !freightModal && !detailsFreight && !carrierModal && !quickActionsOpen;
  const pullReady = pullDistance >= PULL_REFRESH_THRESHOLD;

  return (
    <m.div className="app-shell" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <aside className="sidebar">
        <Brand />
        <button className="sidebar-new" onClick={openNewFreight}><Plus size={19} aria-hidden="true" /> Novo frete</button>
        <nav className="nav" aria-label="Menu principal">
          <NavButton active={tab === "dashboard"} icon={<LayoutDashboard />} label="Visão geral" onClick={() => navigate("dashboard")} />
          <NavButton active={tab === "freights"} icon={<Route />} label="Fretes" badge={freights.length || undefined} onClick={() => navigate("freights")} />
          <NavButton active={tab === "expenses"} icon={<ReceiptText />} label="Despesas" badge={expenseSummary.count || undefined} onClick={() => navigate("expenses")} />
          <NavButton active={tab === "reports"} icon={<ClipboardList />} label="Relatórios" onClick={() => navigate("reports")} />
          <NavButton active={tab === "carriers"} icon={<Building2 />} label="Transportadoras" onClick={() => navigate("carriers")} />
        </nav>
        <div className="sidebar-reserve">
          <div className="reserve-icon"><Percent size={19} /></div>
          <div><strong>Comissão por carreta</strong><span>13% no Bitrem 30 metros ou 15% na Carreta LS, calculados automaticamente.</span></div>
        </div>
        <button className="logout-button" onClick={() => void logout()}><LogOut size={17} /> Sair do sistema</button>
      </aside>

      <main className="main" onTouchStart={handlePullStart} onTouchMove={handlePullMove} onTouchEnd={handlePullEnd} onTouchCancel={() => { pullStartYRef.current = null; setPullDistance(0); }}>
        <ScrollProgress />
        <m.div
          className={`pull-refresh-indicator ${pullReady ? "ready" : ""}`.trim()}
          aria-hidden="true"
          animate={{ y: refreshing ? 12 : pullDistance ? Math.max(-42, pullDistance - 58) : -58, opacity: refreshing || pullDistance > 8 ? 1 : 0, scale: pullReady || refreshing ? 1 : .9 }}
          transition={pullDistance ? { duration: .05 } : { type: "spring", stiffness: 420, damping: 32 }}
        >
          <m.span animate={{ rotate: refreshing ? 360 : pullDistance * 2.6 }} transition={refreshing ? { duration: .8, repeat: Infinity, ease: "linear" } : { duration: .08 }}><RefreshCw size={18} /></m.span>
          <small>{refreshing ? "Atualizando..." : pullReady ? "Solte para atualizar" : "Puxe para atualizar"}</small>
        </m.div>
        <header className="topbar">
          <div className="mobile-brand"><Brand compact /></div>
          <div className="topbar-copy"><span className="eyebrow"><Zap size={13} /> Controle pessoal</span><strong>{pageTitle}</strong></div>
          <div className="top-actions">
            {dataMode === "local" && <span className="local-mode-pill">Modo local</span>}
            <ThemeToggle />
            <button className="icon-button mobile-only" aria-label="Atualizar informações" aria-busy={refreshing} disabled={refreshing} onClick={() => void load(true)}><RefreshCw className={refreshing ? "spin" : undefined} size={19} /></button>
            <div className="profile"><div className="avatar">G</div><div><strong>Galvão</strong><span>Motorista PJ</span></div></div>
            <button className="icon-button desktop-only" aria-label="Sair do sistema" onClick={() => void logout()}><LogOut size={18} /></button>
          </div>
        </header>

        <div className="content">
          <m.div className="page-head" key={`page-head-${tab}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
            <div>
              <span className="date-line"><CalendarDays size={14} /> {fullDate.format(new Date())}</span>
              <h1>{pageTitle}</h1>
              <p>{pageCopy}</p>
            </div>
            {tab !== "reports" && <button className="button primary desktop-action" onClick={() => tab === "carriers" ? openNewCarrier() : tab === "expenses" ? openNewExpense() : openNewFreight()}><Plus size={18} /> {tab === "carriers" ? "Nova transportadora" : tab === "expenses" ? "Nova despesa" : "Novo frete"}</button>}
          </m.div>

          <AnimatePresence mode="wait" initial={false}>
            <m.div className="page-motion" key={loading ? "loading" : tab} initial={{ opacity: 0, x: loading ? 0 : pageDirection * 18, y: loading ? 10 : 0 }} animate={{ opacity: 1, x: 0, y: 0 }} exit={{ opacity: 0, x: loading ? 0 : pageDirection * -14 }} transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}>
          {loading ? <DashboardSkeleton /> : tab === "dashboard" ? (
            <DashboardHome
              analytics={analytics}
              chart={chart}
              statusDistribution={statusDistribution}
              maxStatus={maxStatus}
              freights={freights}
              onNew={openNewFreight}
              onOpenFreights={() => navigate("freights")}
              onOpen={setDetailsFreight}
              onRemove={(id) => void remove("freights", id)}
              expenseSummary={expenseSummary}
              monthBalance={monthBalance}
              onNewExpense={() => { navigate("expenses"); openNewExpense(); }}
            />
          ) : tab === "freights" ? (
            <section className="page-section enter">
              <div className="operations-toolbar operations-toolbar-search-only">
                <div className="search-field">
                  <Search size={18} aria-hidden="true" />
                  <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar CT-e, origem, destino ou transportadora" aria-label="Buscar fretes" />
                  {query && <button onClick={() => setQuery("")} aria-label="Limpar busca"><X size={16} /></button>}
                </div>
              </div>

              <AnimatePresence initial={false}>
                {activeFilters > 0 && (
                  <m.div className="active-filter-row" initial={{ opacity: 0, height: 0, y: -6 }} animate={{ opacity: 1, height: "auto", y: 0 }} exit={{ opacity: 0, height: 0, y: -4 }}>
                    <span>{filteredFreights.length} de {freights.length} fretes</span>
                    <button onClick={clearFilters}>Busca: {query}<X size={13} /></button>
                  </m.div>
                )}
              </AnimatePresence>

              <Reveal className="card panel operations-panel">
                <div className="panel-heading"><div><span className="section-kicker">Histórico pessoal</span><h2>Todos os fretes</h2></div><span className="count-pill">{filteredFreights.length} registros</span></div>
                <FreightList items={filteredFreights} onOpen={setDetailsFreight} onRemove={(id) => void remove("freights", id)} onNew={openNewFreight} highlightedId={highlightedFreightId} />
              </Reveal>
            </section>
          ) : tab === "expenses" ? null : tab === "reports" ? (
            <ReportsPage
              start={reportStart}
              end={reportEnd}
              onStart={(value) => { setReportStart(value); setReportGenerated(false); }}
              onEnd={(value) => { setReportEnd(value); setReportGenerated(false); }}
              onGenerate={generateReport}
              generated={reportGenerated}
              freights={reportFreights}
              totals={reportSummary}
              daily={reportDaily}
              onOpen={setDetailsFreight}
              onPdf={() => void exportReport("pdf")}
              onXlsx={() => void exportReport("xlsx")}
              exporting={exporting}
            />
          ) : (
            <section className="page-section enter">
              {carriers.length ? (
                <div className="carrier-grid">
                  {carriers.map((carrier, index) => {
                    const carrierFreights = freights.filter((item) => item.carrierId === carrier.id);
                    const commission = carrierFreights.reduce((sum, item) => sum + item.commissionValue, 0);
                    return (
                      <m.article className="card carrier-card spotlight-surface" key={carrier.id} initial={{ opacity: 0, y: 14 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: .16 }} transition={{ delay: index * 0.045 }} whileHover={{ y: -3 }} whileTap={{ scale: .985 }} layout>
                        <div className="carrier-top"><div className="carrier-logo"><Building2 size={22} /></div><StatusBadge status={carrier.active ? "Ativa" : "Inativa"} /></div>
                        <h3>{carrier.name}</h3>
                        <p>{carrier.phone || "Telefone não informado"}</p>
                        <div className="carrier-stats"><div><span>Fretes</span><strong>{carrierFreights.length}</strong></div><div><span>Comissões</span><strong>{compactMoney.format(commission)}</strong></div></div>
                        <div className="carrier-actions"><button className="button ghost" onClick={() => openEditCarrier(carrier)}><Edit3 size={16} /> Editar</button><button className="button danger subtle" onClick={() => void remove("carriers", carrier.id)}><Trash2 size={16} /> Excluir</button></div>
                        <Spotlight />
                      </m.article>
                    );
                  })}
                </div>
              ) : <EmptyState icon={<Building2 />} title="Nenhuma transportadora cadastrada" copy="Cadastre a transportadora responsável pelos seus fretes." action="Cadastrar transportadora" onAction={openNewCarrier} />}
            </section>
          )}
            </m.div>
          </AnimatePresence>
          <ExpensesModule key={expenseOpenRequest} visible={tab === "expenses"} openRequest={expenseOpenRequest} onSummaryChange={handleExpenseSummary} onToast={handleExpenseToast} />
        </div>
      </main>

      <AnimatePresence>
        {quickActionsOpen && <m.button className="quick-actions-scrim" aria-label="Fechar ações rápidas" onClick={() => setQuickActionsOpen(false)} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />}
      </AnimatePresence>
      <m.nav className="bottom-nav bottom-nav-five" aria-label="Navegação principal" animate={{ y: hideMobileNav ? "115%" : "0%", opacity: hideMobileNav ? .84 : 1 }} transition={{ type: "spring", stiffness: 360, damping: 36 }}>
        <BottomNavButton active={tab === "dashboard"} icon={<LayoutDashboard />} label="Início" onClick={() => navigate("dashboard")} />
        <BottomNavButton active={tab === "freights"} icon={<Route />} label="Fretes" onClick={() => navigate("freights")} />
        <div className="quick-action-anchor">
          <AnimatePresence>
            {quickActionsOpen && (
              <m.div className="quick-actions-menu" initial={{ opacity: 0, y: 18, scale: .9 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 14, scale: .92 }} transition={{ type: "spring", stiffness: 430, damping: 31 }}>
                <m.button onClick={() => runQuickAction("freight")} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .05 }}><span><Route size={18} /></span><div><strong>Novo frete</strong><small>Registrar comissão</small></div></m.button>
                <m.button onClick={() => runQuickAction("expense")} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .09 }}><span><ReceiptText size={18} /></span><div><strong>Nova despesa</strong><small>Registrar saída</small></div></m.button>
                <m.button onClick={() => runQuickAction("report")} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .13 }}><span><ClipboardList size={18} /></span><div><strong>Relatório</strong><small>Consultar período</small></div></m.button>
              </m.div>
            )}
          </AnimatePresence>
          <m.button className={`main-action ${quickActionsOpen ? "open" : ""}`.trim()} aria-label={quickActionsOpen ? "Fechar ações rápidas" : "Abrir ações rápidas"} aria-expanded={quickActionsOpen} onClick={() => setQuickActionsOpen((current) => !current)} whileTap={{ scale: .94 }} layout>
            <m.span className="main-action-icon" animate={{ rotate: quickActionsOpen ? 45 : 0 }}><Plus size={26} /></m.span>
            <AnimatePresence mode="wait" initial={false}><m.span className="main-action-label" key={quickActionsOpen ? "close" : "new"} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}>{quickActionsOpen ? "Fechar" : "Novo"}</m.span></AnimatePresence>
          </m.button>
        </div>
        <BottomNavButton active={tab === "expenses"} icon={<ReceiptText />} label="Despesas" onClick={() => navigate("expenses")} />
        <BottomNavButton active={tab === "reports"} icon={<ClipboardList />} label="Relatórios" onClick={() => navigate("reports")} />
      </m.nav>
      <AnimatePresence>
      {freightModal && (
        <m.div className="modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(event) => event.target === event.currentTarget && setFreightModal(false)}>
          <m.form className="modal freight-form-modal" onSubmit={saveFreight} initial={{ opacity: 0, y: 18, scale: 0.985 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 12, scale: 0.99 }}>
            <ModalHeader
              icon={<Route />}
              title={editingFreight ? "Editar frete" : "Novo frete"}
              copy={editingFreight ? "Atualize os dados e confira a nova comissão." : "Registre a viagem e calcule 13% no Bitrem ou 15% na LS."}
              onClose={() => setFreightModal(false)}
            />
            <div className="form-section">
              <div className="form-section-title"><span>01</span><div><strong>Identificação</strong><small>Modalidade, carregamento e transportadora</small></div></div>
              <div className="form-grid">
                <Field full label="Modalidade da viagem" required>
                  <div className="trip-mode-grid" role="radiogroup" aria-label="Modalidade da viagem">
                    <button type="button" role="radio" aria-checked={draft.operationKind === "freight"} className={draft.operationKind === "freight" ? "active" : ""} onClick={() => updateDraft("operationKind", "freight")}><Truck size={18} /><span>Frete carregado<small>Comissão por percentual</small></span></button>
                    <button type="button" role="radio" aria-checked={draft.operationKind === "empty_return"} className={draft.operationKind === "empty_return" ? "active" : ""} onClick={() => updateDraft("operationKind", "empty_return")}><Route size={18} /><span>Volta vazia<small>Ajuda de custo</small></span></button>
                  </div>
                </Field>
                <Field full label="Data e hora do carregamento" required><input value={draft.loadingAt} onChange={(event) => { updateDraft("loadingAt", event.target.value); updateDraft("freightDate", event.target.value.slice(0, 10)); }} type="datetime-local" required /></Field>
                <Field label="Número do CT-e"><input value={draft.cteNumber} onChange={(event) => updateDraft("cteNumber", event.target.value)} inputMode="numeric" placeholder="Opcional" /></Field>
                <Field label="Transportadora" required>
                  <select value={draft.carrierId} onChange={(event) => updateDraft("carrierId", event.target.value)} required>
                    <option value="" disabled>Selecione</option>
                    {carriers.filter((item) => item.active).map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}
                  </select>
                </Field>
                <Field full label={draft.operationKind === "freight" ? "Carreta utilizada" : "Conjunto da volta vazia"} required>
                  <select value={draft.equipmentType} onChange={(event) => updateDraft("equipmentType", event.target.value as EquipmentType)} required>
                    <option value="bitrem_30m">{EQUIPMENT_LABEL.bitrem_30m}</option>
                    <option value="carreta_ls">{EQUIPMENT_LABEL.carreta_ls}</option>
                  </select>
                </Field>
              </div>
            </div>

            <div className="form-section">
              <div className="form-section-title"><span>02</span><div><strong>Origem e destino</strong><small>Informações para consulta do frete</small></div></div>
              <div className="form-grid">
                <Field full label="Ponto de partida" required><div className="input-with-icon"><MapPin size={17} /><input value={draft.origin} onChange={(event) => updateDraft("origin", event.target.value)} required placeholder="Cidade, endereço ou local de saída" /></div></Field>
                <Field full label="Destino final" required><div className="input-with-icon"><MapPin size={17} /><input value={draft.destination} onChange={(event) => updateDraft("destination", event.target.value)} required placeholder="Cidade, endereço ou local de entrega" /></div></Field>
              </div>
            </div>

            <div className="form-section">
              <div className="form-section-title"><span>03</span><div><strong>Financeiro e status</strong><small>{draft.operationKind === "freight" ? "Comissão calculada automaticamente pela carreta" : "Informe o valor recebido nesta volta"}</small></div></div>
              <div className="form-grid">
                {draft.operationKind === "freight" ? (
                  <>
                    <Field full label="Valor do CT-e / Valor total do frete" required>
                      <input value={draft.freightValue} onChange={(event) => updateDraft("freightValue", formatCurrencyInput(event.target.value))} type="text" inputMode="numeric" required placeholder="R$ 0,00" />
                    </Field>
                    <div className="commission-preview">
                      <div><Percent size={20} /><span>Sua comissão — {draftCommissionPercent}%<small>{EQUIPMENT_LABEL[draft.equipmentType]} · calculada sobre o valor total</small></span></div>
                      <strong>{money.format(draftCommission)}</strong>
                    </div>
                  </>
                ) : (
                  <>
                    <Field full label="Valor da volta vazia" required>
                      <input value={draft.emptyReturnAmount} onChange={(event) => updateDraft("emptyReturnAmount", formatCurrencyInput(event.target.value))} type="text" inputMode="numeric" required placeholder="R$ 0,00" />
                    </Field>
                    <div className="commission-preview empty-return-ready">
                      <div><Route size={20} /><span>Ajuda de custo da volta<small>{EQUIPMENT_LABEL[draft.equipmentType]} · valor informado manualmente</small></span></div>
                      <strong>{money.format(draftCommission)}</strong>
                    </div>
                  </>
                )}
                <Field label="Status da viagem"><select value={draft.status} onChange={(event) => updateDraft("status", event.target.value)}><option value="concluido">Concluída</option><option value="pendente">Pendente</option><option value="cancelado">Cancelada</option></select></Field>
                <Field full label="Observações"><textarea value={draft.notes} onChange={(event) => updateDraft("notes", event.target.value)} placeholder="Informações importantes sobre a viagem" /></Field>
              </div>
            </div>
            <div className="form-actions">
              <button type="button" className="button ghost" onClick={() => setFreightModal(false)}>Cancelar</button>
              <m.button className={`button primary ${saveConfirmed ? "save-confirmed" : ""}`} disabled={saving || saveConfirmed}>{saveConfirmed ? <m.span className="save-confirmation" initial={{ opacity: 0, scale: .7 }} animate={{ opacity: 1, scale: 1 }}><Check size={18} /> Frete salvo</m.span> : saving ? <><RefreshCw className="spin" size={17} /> Salvando...</> : <><Check size={18} /> {editingFreight ? "Salvar alterações" : "Salvar frete"}</>}</m.button>
            </div>
          </m.form>
        </m.div>
      )}
      </AnimatePresence>

      <AnimatePresence>{detailsFreight && <FreightDetails freight={detailsFreight} onClose={() => setDetailsFreight(null)} onEdit={() => openEditFreight(detailsFreight)} onRemove={() => void remove("freights", detailsFreight.id)} />}</AnimatePresence>

      <AnimatePresence>
      {carrierModal && (
        <m.div className="modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(event) => event.target === event.currentTarget && closeCarrierModal()}>
          <m.form className="modal small" key={editingCarrier?.id ?? "new"} onSubmit={saveCarrier} initial={{ opacity: 0, y: 16, scale: 0.985 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10, scale: 0.99 }}>
            <ModalHeader icon={<Building2 />} title={editingCarrier ? "Editar transportadora" : "Nova transportadora"} copy={editingCarrier ? "Atualize os dados da transportadora." : "Cadastre uma transportadora para os próximos fretes."} onClose={closeCarrierModal} />
            <div className="form-grid">
              <Field full label="Nome da transportadora" required><input name="name" required defaultValue={editingCarrier?.name ?? ""} placeholder="Nome da empresa" /></Field>
              <Field full label="Telefone"><input name="phone" type="tel" inputMode="tel" defaultValue={editingCarrier?.phone ?? ""} placeholder="(00) 00000-0000" /></Field>
            </div>
            <div className="form-actions"><button type="button" className="button ghost" onClick={closeCarrierModal}>Cancelar</button><button className="button primary" disabled={saving}>{saving ? "Salvando..." : editingCarrier ? "Salvar alterações" : "Cadastrar empresa"}</button></div>
          </m.form>
        </m.div>
      )}
      </AnimatePresence>


      <AnimatePresence>{toast && <m.div key={toast} className="toast" role="status" initial={{ opacity: 0, y: 12, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8, scale: 0.98 }}><m.span initial={{ scale: 0, rotate: -20 }} animate={{ scale: 1, rotate: 0 }}><Check size={15} /></m.span>{toast}<m.i className="toast-progress" initial={{ scaleX: 1 }} animate={{ scaleX: 0 }} transition={{ duration: 5.2, ease: "linear" }} /></m.div>}</AnimatePresence>
    </m.div>
  );
}

function Spotlight() {
  const spotRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const spot = spotRef.current;
    const surface = spot?.parentElement;
    if (!spot || !surface || !window.matchMedia("(hover: hover) and (pointer: fine) and (min-width: 900px)").matches) return;

    let disposed = false;
    let cleanup = () => {};
    void import("gsap").then(({ gsap }) => {
      if (disposed) return;
      const xTo = gsap.quickTo(spot, "x", { duration: .42, ease: "power3.out" });
      const yTo = gsap.quickTo(spot, "y", { duration: .42, ease: "power3.out" });
      const opacityTo = gsap.quickTo(spot, "opacity", { duration: .2, ease: "power2.out" });
      const move = (event: PointerEvent) => {
        const bounds = surface.getBoundingClientRect();
        xTo(event.clientX - bounds.left - 100);
        yTo(event.clientY - bounds.top - 100);
        opacityTo(.42);
      };
      const leave = () => opacityTo(0);
      surface.addEventListener("pointermove", move);
      surface.addEventListener("pointerleave", leave);
      cleanup = () => {
        surface.removeEventListener("pointermove", move);
        surface.removeEventListener("pointerleave", leave);
      };
    });

    return () => {
      disposed = true;
      cleanup();
    };
  }, []);

  return <span ref={spotRef} className="pointer-spotlight" aria-hidden="true" style={{ position: "absolute", left: 0, top: 0, width: 200, height: 200, display: "block", pointerEvents: "none" }} />;
}
function ScrollProgress() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 240, damping: 34, mass: .28 });
  return <m.div className="scroll-progress" style={{ scaleX }} aria-hidden="true" />;
}

function Reveal({ children, className, delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  return (
    <m.div
      className={`${className ?? ""} spotlight-surface`.trim()}
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: .14, margin: "0px 0px -36px" }}
      transition={{ duration: .42, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
      <Spotlight />
    </m.div>
  );
}
function DashboardHome({ analytics, chart, statusDistribution, maxStatus, freights, onNew, onOpenFreights, onOpen, onRemove, expenseSummary, monthBalance, onNewExpense }: {
  analytics: {
    freightTotal: number;
    commissionTotal: number;
    commissionReceived: number;
    currentMonth: number;
    previousMonth: number;
    change: number | null;
    averageCommission: number;
    thisMonthCount: number;
    completedCount: number;
    pendingCount: number;
    cancelledCount: number;
  };
  chart: { key: string; label: string; value: number }[];
  statusDistribution: { label: string; value: number }[];
  maxStatus: number;
  freights: Freight[];
  onNew: () => void;
  onOpenFreights: () => void;
  onOpen: (freight: Freight) => void;
  onRemove: (id: number) => void;
  expenseSummary: { total: number; count: number };
  monthBalance: number;
  onNewExpense: () => void;
}) {
  return (
    <div className="dashboard-home enter">
      <Reveal className="command-banner">
        <div className="command-copy">
          <span className="command-kicker"><span /> Controle financeiro pessoal</span>
          <h2>Entradas e gastos sob controle.</h2>
          <p>Registre fretes e despesas para saber exatamente quanto entrou, quanto saiu e qual é o saldo do mês.</p>
          <button className="button light" onClick={onNew}><Plus size={18} /> Registrar frete</button>
        </div>
        <div className="command-pulse income-commission-card">
          <div className="income-card-inner">
            <div className="income-card-heading">
              <span>Comissões deste mês</span>
              <span className="income-card-wallet" aria-hidden="true"><WalletCards size={20} /></span>
            </div>
            <div className="income-card-amount">
              <strong><AnimatedNumber value={analytics.currentMonth} format={formatMoneyValue} /></strong>
              {analytics.change !== null && (
                <span className={analytics.change >= 0 ? "positive" : "negative"}>
                  {analytics.change >= 0 ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
                  {Math.abs(analytics.change).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%
                </span>
              )}
            </div>
            <p className="income-card-compare">
              {analytics.previousMonth > 0
                ? `Comparado a ${money.format(analytics.previousMonth)} no mês anterior`
                : "Primeiro mês de acompanhamento"}
            </p>
          </div>
          <div className="income-card-footer">
            <b>{analytics.thisMonthCount} {analytics.thisMonthCount === 1 ? "frete" : "fretes"}</b>
            <i />
            <b>Média {compactMoney.format(analytics.averageCommission)}</b>
          </div>
        </div>
        <div className="route-lines" aria-hidden="true"><i /><i /><i /></div>
      </Reveal>

      <section className="monthly-cashflow" aria-label="Movimentação financeira deste mês">
        <m.article className="card cashflow-card income" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .04 }}>
          <div className="cashflow-icon"><ArrowUpRight size={21} /></div><div><span>Entradas do mês</span><strong><AnimatedNumber value={analytics.currentMonth} format={formatMoneyValue} /></strong><small>Comissões e voltas vazias</small></div>
        </m.article>
        <m.article className="card cashflow-card expense" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .08 }} onClick={onNewExpense} role="button" tabIndex={0}>
          <div className="cashflow-icon"><ArrowDownRight size={21} /></div><div><span>Gastos do mês</span><strong><AnimatedNumber value={expenseSummary.total} format={formatMoneyValue} /></strong><small>{expenseSummary.count} {expenseSummary.count === 1 ? "despesa registrada" : "despesas registradas"}</small></div>
        </m.article>
        <m.article className={`card cashflow-card balance ${monthBalance >= 0 ? "positive" : "negative"}`} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .12 }}>
          <div className="cashflow-icon">{monthBalance >= 0 ? <Check size={21} /> : <TrendingDownIcon />}</div><div><span>Saldo do mês</span><strong><AnimatedNumber value={monthBalance} format={formatMoneyValue} /></strong><small>{monthBalance >= 0 ? "Mês positivo · tudo certo" : "Mês negativo · atenção aos gastos"}</small></div>
        </m.article>
      </section>

      <section className="metrics" aria-label="Indicadores principais">
        <KpiCard icon={<Check />} label="Comissões recebidas" value={analytics.commissionReceived} format={formatMoneyValue} detail={`${freights.length} fretes registrados`} tone="green" spark={chart.map((item) => item.value)} index={0} />
        <KpiCard icon={<Truck />} label="Valor total dos fretes" value={analytics.freightTotal} format={formatMoneyValue} detail="13% Bitrem · 15% LS" tone="cyan" progress={analytics.freightTotal ? 15 : 0} index={1} />
        <KpiCard icon={<PackageCheck />} label="Total de fretes" value={freights.length} format={formatIntegerValue} detail="Registros no histórico" tone="blue" progress={freights.length ? 100 : 0} index={2} />
        <KpiCard icon={<Percent />} label="Média por frete" value={analytics.averageCommission} format={formatMoneyValue} detail="Comissão média recebida" tone="navy" progress={analytics.commissionTotal ? 100 : 0} index={3} />
      </section>

      <section className="dashboard-grid">
        <Reveal className="card panel revenue-panel finance-stat-card" delay={.01}>
          <FinanceLineChart chart={chart} change={analytics.change} />
        </Reveal>
        <Reveal className="card panel allocation-panel" delay={.035}>
          <div className="panel-heading"><div><span className="section-kicker">Consolidação financeira</span><h2>Comissões recebidas</h2></div><Check size={19} /></div>
          <div className="donut-wrap">
            <div className="donut" style={{ "--available": "100%" } as CSSProperties}><div><strong>100%</strong><span>recebidas</span></div></div>
            <div className="allocation-legend allocation-legend-single"><div><span><i className="legend-dot available" />Total recebido</span><strong><AnimatedNumber value={analytics.commissionReceived} format={formatMoneyValue} /></strong><small>Toda comissão cadastrada é confirmada automaticamente.</small></div></div>
          </div>
        </Reveal>

        <Reveal className="card panel type-panel" delay={.055}>
          <div className="panel-heading"><div><span className="section-kicker">Andamento</span><h2>Status dos fretes</h2></div><BarChart3 size={19} /></div>
          {statusDistribution.length ? <div className="horizontal-bars">{statusDistribution.map((item) => <div className="horizontal-row" key={item.label}><div><span>{item.label}</span><strong>{item.value}</strong></div><div className="horizontal-track"><span style={{ width: `${item.value / maxStatus * 100}%` }} /></div></div>)}</div> : <MiniEmpty copy="Os status aparecerão após o primeiro frete." />}
        </Reveal>

        <Reveal className="card panel recent-panel" delay={.075}>
          <div className="panel-heading"><div><span className="section-kicker">Últimos registros</span><h2>Fretes recentes</h2></div><button className="button text-button" onClick={onOpenFreights}>Ver todos <ArrowRight size={15} /></button></div>
          <FreightList items={freights.slice(0, 4)} onOpen={onOpen} onRemove={onRemove} onNew={onNew} compact />
        </Reveal>
      </section>
    </div>
  );
}
function TrendingDownIcon() { return <ArrowDownRight size={21} />; }
function FinanceLineChart({ chart, change }: { chart: { key: string; label: string; value: number }[]; change: number | null }) {
  const [range, setRange] = useState<3 | 6>(6);
  const [activePoint, setActivePoint] = useState<string | null>(null);
  const visibleChart = chart.slice(-range);
  const chartMax = Math.max(...visibleChart.map((item) => item.value), 1);
  const plotLeft = 24;
  const plotRight = 336;
  const plotTop = 22;
  const plotBottom = 104;
  const points = visibleChart.map((item, index) => ({
    ...item,
    x: visibleChart.length <= 1 ? 180 : plotLeft + index * ((plotRight - plotLeft) / (visibleChart.length - 1)),
    y: plotBottom - (item.value / chartMax) * (plotBottom - plotTop),
  }));
  const linePath = points.length ? `M ${points.map((point) => `${point.x},${point.y}`).join(" L ")}` : "";
  const areaPath = points.length ? `${linePath} L ${points[points.length - 1].x},${plotBottom + 5} L ${points[0].x},${plotBottom + 5} Z` : "";
  const total = visibleChart.reduce((sum, item) => sum + item.value, 0);
  const average = visibleChart.length ? total / visibleChart.length : 0;
  const trendUp = (change ?? 0) >= 0;
  const scrubChart = (event: ReactPointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const position = Math.min(Math.max(event.clientX - bounds.left, 0), Math.max(bounds.width - 1, 0));
    const index = Math.min(points.length - 1, Math.max(0, Math.round(position / Math.max(bounds.width, 1) * Math.max(points.length - 1, 0))));
    if (points[index]) setActivePoint(points[index].key);
  };

  return (
    <div className="finance-card-content">
      <div className="finance-card-header">
        <div><span className="section-kicker">Acompanhamento financeiro</span><h2>Comissões por mês</h2></div>
        <details className="finance-range-menu">
          <summary aria-label="Escolher período do gráfico"><span /><span /><span /></summary>
          <div>
            <button className={range === 3 ? "active" : ""} type="button" onClick={(event) => { setRange(3); setActivePoint(null); event.currentTarget.closest("details")?.removeAttribute("open"); }}>{range === 3 && <Check size={14} />} Últimos 3 meses</button>
            <button className={range === 6 ? "active" : ""} type="button" onClick={(event) => { setRange(6); setActivePoint(null); event.currentTarget.closest("details")?.removeAttribute("open"); }}>{range === 6 && <Check size={14} />} Últimos 6 meses</button>
          </div>
        </details>
      </div>

      <div className="finance-chart-canvas chart-scrubber" role="group" aria-label={`Gráfico de comissões dos últimos ${range} meses. Toque ou deslize pelos pontos para consultar valores.`} onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); scrubChart(event); }} onPointerMove={(event) => { if (event.buttons === 1) scrubChart(event); }} onPointerUp={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }}>
        <svg className="finance-linechart" viewBox="0 0 360 150" aria-hidden="true">
          <defs>
            <linearGradient id="financeLineGradient" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stopColor="#56b5ff" /><stop offset="100%" stopColor="#50d4a0" /></linearGradient>
            <linearGradient id="financeAreaGradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#43a8ff" stopOpacity=".34" /><stop offset="100%" stopColor="#50d4a0" stopOpacity="0" /></linearGradient>
            <filter id="financeGlow" x="-20%" y="-25%" width="140%" height="150%"><feGaussianBlur result="coloredBlur" stdDeviation="3" /><feMerge><feMergeNode in="coloredBlur" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
          </defs>
          {[32, 58, 84, 110].map((y) => <line className="finance-grid-line" x1="20" x2="340" y1={y} y2={y} key={y} />)}
          {areaPath && <m.path className="finance-chart-area" d={areaPath} fill="url(#financeAreaGradient)" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: .5 }} />}
          {linePath && <m.path className="finance-chart-line" d={linePath} fill="none" stroke="url(#financeLineGradient)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" filter="url(#financeGlow)" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: .8, ease: [0.22, 1, 0.36, 1] }} />}
          {points.map((point, index) => <m.circle className={activePoint === point.key ? "active" : ""} cx={point.x} cy={point.y} r={activePoint === point.key ? 6.5 : 5} fill={index === points.length - 1 ? "#50d4a0" : "#56b5ff"} key={point.key} initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: .16 + index * .07, type: "spring", stiffness: 380, damping: 24 }} />)}
          {points.map((point) => <text className="finance-x-label" x={point.x} y="138" textAnchor="middle" key={`label-${point.key}`}>{point.label}</text>)}
        </svg>
        {points.map((point, index) => <button type="button" className={`finance-chart-point ${index === 0 ? "edge-start" : index === points.length - 1 ? "edge-end" : ""}`} style={{ left: `${point.x / 3.6}%`, top: `${point.y / 1.5}%` }} aria-label={`${point.label}: ${money.format(point.value)}`} onClick={() => setActivePoint((current) => current === point.key ? null : point.key)} onBlur={() => setActivePoint(null)} key={`point-${point.key}`}><span className="finance-hit-dot" />{activePoint === point.key && <m.span className="finance-point-tooltip" initial={{ opacity: 0, y: 5, scale: .95 }} animate={{ opacity: 1, y: 0, scale: 1 }}><small>{point.label}</small><strong>{money.format(point.value)}</strong></m.span>}</button>)}
      </div>

      <div className="finance-chart-summary">
        <div><span>Média mensal</span><strong><AnimatedNumber value={average} format={formatMoneyValue} /></strong></div>
        <div><span>Total no período</span><strong><AnimatedNumber value={total} format={formatMoneyValue} /></strong></div>
        {change !== null && <span className={`finance-trend ${trendUp ? "positive" : "negative"}`}>{trendUp ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}{Math.abs(change).toFixed(0)}% vs. mês anterior</span>}
      </div>
    </div>
  );
}
function ReportsPage({ start, end, onStart, onEnd, onGenerate, generated, freights, totals, daily, onOpen, onPdf, onXlsx, exporting }: {
  start: string;
  end: string;
  onStart: (value: string) => void;
  onEnd: (value: string) => void;
  onGenerate: () => void;
  generated: boolean;
  freights: Freight[];
  totals: ReturnType<typeof reportTotals>;
  daily: { date: string; commission: number; count: number }[];
  onOpen: (freight: Freight) => void;
  onPdf: () => void;
  onXlsx: () => void;
  exporting: "pdf" | "xlsx" | null;
}) {
  const maxCommission = Math.max(...daily.map((item) => item.commission), 1);
  const [activeDay, setActiveDay] = useState<string | null>(null);
  const scrubDailyChart = (event: ReactPointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const position = Math.min(Math.max(event.clientX - bounds.left, 0), Math.max(bounds.width - 1, 0));
    const index = Math.min(daily.length - 1, Math.floor(position / Math.max(bounds.width, 1) * daily.length));
    if (daily[index]) setActiveDay(daily[index].date);
  };
  return (
    <section className="reports-page enter">
      <Reveal className="card report-filter-card">
        <div className="report-filter-heading"><div className="report-filter-icon"><CalendarRange size={22} /></div><div><span className="section-kicker">Período de análise</span><h2>Relatório de fretes e comissões</h2><p>Selecione o intervalo para conferir seus ganhos.</p></div></div>
        <div className="report-filter-grid">
          <Field label="Data inicial" required><input type="date" value={start} onChange={(event) => onStart(event.target.value)} /></Field>
          <Field label="Data final" required><input type="date" value={end} onChange={(event) => onEnd(event.target.value)} /></Field>
          <button className="button primary generate-report-button" onClick={onGenerate}><BarChart3 size={18} /> Gerar relatório</button>
        </div>
      </Reveal>

      {!generated ? (
        <Reveal className="card report-waiting"><ClipboardList size={28} /><strong>O relatório aparecerá aqui</strong><p>Escolha as datas e toque em “Gerar relatório”. Somente dados reais do período serão usados.</p></Reveal>
      ) : (
        <div className="report-results">
          <div className="report-result-head">
            <div><span className="section-kicker">Resultado do período</span><h2>Fretes e comissões</h2><p>{new Date(`${start}T12:00:00`).toLocaleDateString("pt-BR")} a {new Date(`${end}T12:00:00`).toLocaleDateString("pt-BR")}</p></div>
            <div className="export-actions"><button className="button ghost" disabled={!freights.length || exporting !== null} onClick={onPdf}>{exporting === "pdf" ? <RefreshCw className="spin" size={17} /> : <FileDown size={17} />} Exportar PDF</button><button className="button primary" disabled={!freights.length || exporting !== null} onClick={onXlsx}>{exporting === "xlsx" ? <RefreshCw className="spin" size={17} /> : <FileSpreadsheet size={17} />} Exportar XLSX</button></div>
          </div>

          <div className="report-kpis report-kpis-commissions">
            <ReportKpi label="Total de fretes" value={totals.count} format={formatIntegerValue} icon={<PackageCheck />} />
            <ReportKpi label="Valor dos fretes" value={totals.freightTotal} format={formatMoneyValue} icon={<Truck />} />
            <ReportKpi label="Bitrem 30 m" value={totals.bitremCount} format={formatIntegerValue} icon={<Truck />} />
            <ReportKpi label="Carreta LS" value={totals.lsCount} format={formatIntegerValue} icon={<Truck />} />
            <ReportKpi label="Total das comissões" value={totals.commissionTotal} format={formatMoneyValue} icon={<CircleDollarSign />} />
            <ReportKpi label="Comissões recebidas" value={totals.commissionReceived} format={formatMoneyValue} icon={<Check />} />
          </div>

          {freights.length ? (
            <>
              {daily.length > 1 && <div className="card panel report-chart-card"><div className="panel-heading"><div><span className="section-kicker">Evolução no período</span><h2>Comissões por dia</h2></div><BarChart3 size={19} /></div><div className="report-daily-chart chart-scrubber" role="group" aria-label="Gráfico de comissões por dia. Deslize para explorar." onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); scrubDailyChart(event); }} onPointerMove={(event) => { if (event.buttons === 1) scrubDailyChart(event); }} onPointerUp={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }}>{daily.map((item, index) => <button type="button" className={`report-day-bar ${activeDay === item.date ? "active" : ""}`.trim()} key={item.date} onClick={() => setActiveDay((current) => current === item.date ? null : item.date)} onBlur={() => setActiveDay(null)} aria-label={`${new Date(`${item.date}T12:00:00`).toLocaleDateString("pt-BR")}: ${money.format(item.commission)}`}><AnimatePresence>{activeDay === item.date && <m.span className="chart-tooltip" initial={{ opacity: 0, x: "-50%", y: 5 }} animate={{ opacity: 1, x: "-50%", y: 0 }} exit={{ opacity: 0, x: "-50%" }}>{money.format(item.commission)}</m.span>}</AnimatePresence><span>{compactMoney.format(item.commission)}</span><div><m.i initial={{ height: 0 }} animate={{ height: `${Math.max(item.commission / maxCommission * 100, 5)}%` }} transition={{ duration: .48, delay: index * .025 }} /></div><small>{new Date(`${item.date}T12:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}</small></button>)}</div></div>}

              <div className="report-mobile-list">
                {freights.map((item) => <button className="card report-freight-card" key={item.id} onClick={() => onOpen(item)}><div><span>{formatLoadingAt(item.loadingAt)}</span><StatusBadge status="Recebida" /></div><strong>{freightLabel(item)}</strong><small>{EQUIPMENT_LABEL[item.equipmentType]} · {item.operationKind === "empty_return" ? "Volta vazia" : `${item.commissionPercent}%`}</small><p><MapPin size={14} /> {item.origin} <ArrowRight size={13} /> {item.destination}</p><div><span>{money.format(item.freightValue)}</span><b>{money.format(item.commissionValue)}</b></div></button>)}
              </div>

              <div className="card report-table-card"><div className="report-table-wrap"><table><thead><tr><th>Carregamento</th><th>CT-e</th><th>Transportadora</th><th>Carreta</th><th>Origem</th><th>Destino</th><th>Valor</th><th>%</th><th>Comissão recebida</th><th>Frete</th></tr></thead><tbody>{freights.map((item) => <tr key={item.id} onClick={() => onOpen(item)}><td>{formatLoadingAt(item.loadingAt)}</td><td><strong>{item.cteNumber || "—"}</strong></td><td>{item.carrierName ?? "—"}</td><td>{EQUIPMENT_LABEL[item.equipmentType]}</td><td>{item.origin}</td><td>{item.destination}</td><td>{item.operationKind === "empty_return" ? "—" : money.format(item.freightValue)}</td><td>{item.operationKind === "empty_return" ? "—" : `${item.commissionPercent}%`}</td><td>{money.format(item.commissionValue)}</td><td><StatusBadge status={statusLabel(item.status)} /></td></tr>)}</tbody></table></div></div>
            </>
          ) : <div className="card report-empty"><CalendarRange size={27} /><strong>Nenhum frete neste período</strong><p>Altere as datas para consultar outro intervalo.</p></div>}
        </div>
      )}
    </section>
  );
}

function FreightDetails({ freight, onClose, onEdit, onRemove }: { freight: Freight; onClose: () => void; onEdit: () => void; onRemove: () => void }) {
  const dragControls = useDragControls();
  return (
    <m.div className="modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <m.section className="modal freight-details-modal" aria-labelledby="freight-details-title" layoutId={`freight-card-${freight.id}`} drag="y" dragControls={dragControls} dragListener={false} dragConstraints={{ top: 0, bottom: 0 }} dragElastic={{ top: 0, bottom: .28 }} dragMomentum={false} whileDrag={{ scale: .992 }} onDragEnd={(_, info) => { if (info.offset.y > 110 || info.velocity.y > 720) onClose(); }} initial={{ opacity: 0, y: 16, scale: 0.985 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 120, scale: 0.99 }} transition={{ layout: { type: "spring", stiffness: 390, damping: 36 }, duration: .24 }}>
        <div className="modal-drag-handle" aria-hidden="true" onPointerDown={(event) => dragControls.start(event)} />
        <ModalHeader icon={<PackageCheck />} title={freightLabel(freight)} copy={`${freight.operationKind === "empty_return" ? "Volta vazia" : "Frete"} • ${formatLoadingAt(freight.loadingAt)}`} onClose={onClose} />
        <div className="details-status-row"><StatusBadge status={statusLabel(freight.status)} /><StatusBadge status={freight.operationKind === "empty_return" ? "Ajuda recebida" : "Recebida"} /></div>
        <div className="details-section">
          <div className="details-heading"><ClipboardList size={18} /><div><span className="section-kicker">Informações do frete</span><h3>Dados registrados</h3></div></div>
          <div className="freight-info-grid">
            <div><span>Transportadora</span><strong>{freight.carrierName ?? "—"}</strong></div>
            <div><span>Carreta</span><strong>{EQUIPMENT_LABEL[freight.equipmentType]}</strong></div>
            <div><span>Número do CT-e</span><strong>{freight.cteNumber || "Não informado"}</strong></div>
            <div><span>Carregamento</span><strong>{formatLoadingAt(freight.loadingAt)}</strong></div>
          </div>
          <div className="details-route-card"><div className="details-point"><span>A</span><div><small>Origem</small><strong>{freight.origin}</strong></div></div><div className="details-route-line"><i /><ArrowRight size={15} /><i /></div><div className="details-point destination"><span>B</span><div><small>Destino</small><strong>{freight.destination}</strong></div></div></div>
        </div>

        <div className="details-section">
          <div className="details-heading"><CircleDollarSign size={18} /><div><span className="section-kicker">Informações financeiras</span><h3>{freight.operationKind === "empty_return" ? "Ajuda de custo" : "Comissão do motorista"}</h3></div></div>
          <div className="details-financial-grid"><div><span>{freight.operationKind === "empty_return" ? "Modalidade" : "Valor total do frete"}</span><strong>{freight.operationKind === "empty_return" ? "Volta vazia" : money.format(freight.freightValue)}</strong></div><div><span>{freight.operationKind === "empty_return" ? "Conjunto" : "Percentual contratual"}</span><strong>{freight.operationKind === "empty_return" ? EQUIPMENT_LABEL[freight.equipmentType] : `${freight.commissionPercent}%`}</strong></div><div className="featured"><span>Valor que você recebe</span><strong>{money.format(freight.commissionValue)}</strong><small>{freight.operationKind === "empty_return" ? "Valor informado na viagem" : "Calculado automaticamente"}</small></div></div>
          <div className="details-inline"><span>Comissão</span><StatusBadge status="Recebida" /></div>
        </div>
        {freight.notes && <div className="details-notes"><span>Observações</span><p>{freight.notes}</p></div>}
        <div className="details-actions"><button className="button danger subtle" onClick={onRemove}><Trash2 size={16} /> Excluir</button><button className="button primary" onClick={onEdit}><Edit3 size={16} /> Editar frete</button></div>
      </m.section>
    </m.div>
  );
}

function Brand({ compact = false }: { compact?: boolean }) {
  return <div className={`brand ${compact ? "compact" : ""}`}><div className="brand-mark"><ArrowUpRight size={compact ? 18 : 22} strokeWidth={2.8} /></div><div><strong>Galvão <b>Express</b></strong><span>Fretes e comissões</span></div></div>;
}

function NavButton({ active, icon, label, badge, onClick }: { active: boolean; icon: ReactNode; label: string; badge?: number; onClick: () => void }) {
  return <button className={active ? "active" : ""} onClick={onClick}>{icon}<span>{label}</span>{badge !== undefined && <b>{badge}</b>}<ChevronRight className="nav-chevron" size={15} /></button>;
}

function BottomNavButton({ active, icon, label, onClick }: { active: boolean; icon: ReactNode; label: string; onClick: () => void }) {
  return (
    <m.button className={active ? "active" : ""} aria-label={label} onClick={onClick} whileTap={{ scale: .96 }} layout>
      {active && <m.i className="bottom-nav-active" layoutId="bottom-nav-active" transition={{ type: "spring", stiffness: 460, damping: 38 }} />}
      <span className="bottom-nav-icon">{icon}</span>
      <AnimatePresence initial={false}>{active && <m.span className="bottom-nav-label" initial={{ opacity: 0, width: 0, x: -4 }} animate={{ opacity: 1, width: "auto", x: 0 }} exit={{ opacity: 0, width: 0, x: -4 }}>{label}</m.span>}</AnimatePresence>
    </m.button>
  );
}

function AnimatedNumber({ value, format }: { value: number; format: (value: number) => string }) {
  const reduceMotion = useReducedMotion();
  const motionValue = useMotionValue(reduceMotion ? value : 0);
  const [display, setDisplay] = useState(() => format(reduceMotion ? value : 0));

  useEffect(() => {
    if (reduceMotion) {
      motionValue.set(value);
      return;
    }
    const unsubscribe = motionValue.on("change", (latest) => setDisplay(format(latest)));
    const controls = animate(motionValue, value, { duration: .68, ease: [0.22, 1, 0.36, 1] });
    return () => {
      unsubscribe();
      controls.stop();
    };
  }, [format, motionValue, reduceMotion, value]);

  return <span className="animated-number">{reduceMotion ? format(value) : display}</span>;
}

function KpiCard({ icon, label, value, format, detail, tone, spark, progress, index = 0 }: { icon: ReactNode; label: string; value: number; format: (value: number) => string; detail: string; tone: string; spark?: number[]; progress?: number; index?: number }) {
  const max = Math.max(...(spark ?? [1]), 1);
  return (
    <m.article
      className={`card kpi-card ${tone} spotlight-surface`}
      layout
      initial={{ opacity: 0, y: 14, scale: 0.985 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay: 0.04 + index * 0.055, duration: 0.34 }}
      whileHover={{ y: -3 }}
      whileTap={{ scale: .985 }}
    >
      <AnimatePresence initial={false}>
        <m.span
          key={`${label}-${value}`}
          className="kpi-change-glow"
          aria-hidden="true"
          initial={{ opacity: 0, scale: .86 }}
          animate={{ opacity: [0, .72, 0], scale: [.86, 1.04, 1] }}
          exit={{ opacity: 0 }}
          transition={{ duration: .68, ease: "easeOut" }}
        />
      </AnimatePresence>
      <div className="kpi-head"><m.div key={`${label}-icon-${value}`} className="kpi-icon" initial={{ scale: .9, rotate: -6 }} animate={{ scale: 1, rotate: 0 }} whileHover={{ rotate: -5, scale: 1.05 }}>{icon}</m.div><span>{label}</span></div>
      <strong><AnimatedNumber value={value} format={format} /></strong>
      <div className="kpi-footer">
        <small>{detail}</small>
        {spark && <div className="mini-spark" aria-hidden="true">{spark.map((item, sparkIndex) => <m.i key={sparkIndex} initial={{ height: 4 }} animate={{ height: `${Math.max(item / max * 100, 8)}%` }} transition={{ delay: 0.18 + sparkIndex * 0.035 }} />)}</div>}
        {progress !== undefined && <div className="mini-progress" aria-hidden="true"><m.i initial={{ width: 0 }} animate={{ width: `${progress}%` }} transition={{ delay: 0.18 + index * 0.04, duration: 0.5 }} /></div>}
      </div>
      <Spotlight />
    </m.article>
  );
}
function ReportKpi({ label, value, format, icon }: { label: string; value: number; format: (value: number) => string; icon: ReactNode }) {
  return (
    <m.article className="card report-kpi spotlight-surface" layout initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: .2 }} whileTap={{ scale: .985 }}>
      <div><span>{icon}</span><small>{label}</small></div>
      <strong><AnimatedNumber value={value} format={format} /></strong>
      <Spotlight />
    </m.article>
  );
}
function FreightList({ items, onOpen, onRemove, onNew, compact = false, highlightedId = null }: { items: Freight[]; onOpen: (freight: Freight) => void; onRemove: (id: number) => void; onNew: () => void; compact?: boolean; highlightedId?: number | null }) {
  if (!items.length) return <EmptyState icon={<Truck />} title="Nenhum frete encontrado" copy="Registre um frete para começar a acompanhar suas comissões." action="Criar primeiro frete" onAction={onNew} mini={compact} />;
  const openOnKeyboard = (event: ReactKeyboardEvent<HTMLElement>, item: Freight) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onOpen(item);
    }
  };

  return (
    <m.div className={`freight-list ${compact ? "compact-list" : ""}`} layout layoutDependency={items.map((item) => item.id).join("-")}>
      <AnimatePresence initial={false} mode="popLayout">
        {items.map((item) => (
          <m.article
            className={`freight-row freight-row-clickable spotlight-surface ${item.id === highlightedId ? "just-saved" : ""}`.trim()}
            data-freight-id={item.id}
            key={item.id}
            layout
            layoutId={`freight-card-${item.id}`}
            transition={{ layout: { type: "spring", stiffness: 390, damping: 36 } }}
            initial={{ opacity: 0, y: 12, scale: .985 }}
            whileInView={{ opacity: 1, y: 0, scale: 1 }}
            viewport={{ once: true, amount: .1 }}
            exit={{ opacity: 0, x: -24, scale: .97 }}
            whileTap={{ scale: .992 }}
            role="button"
            tabIndex={0}
            onClick={() => onOpen(item)}
            onKeyDown={(event) => openOnKeyboard(event, item)}
          >
            <div className="freight-main"><m.div className="freight-icon" whileHover={{ rotate: -5, scale: 1.05 }}><PackageCheck size={19} /></m.div><div><strong>{freightLabel(item)}</strong><small>{item.carrierName || "Frete"} · {EQUIPMENT_LABEL[item.equipmentType]} · {formatLoadingAt(item.loadingAt)}</small></div></div>
            <div className="route"><AnimatedRoutePoints /><div><strong>{item.origin}</strong><small>para</small><strong>{item.destination}</strong></div></div>
            <div className="freight-meta"><StatusBadge status={statusLabel(item.status)} /><StatusBadge status="Recebida" /></div>
            <div className="amount"><strong>{money.format(item.commissionValue)}</strong><small>{item.operationKind === "empty_return" ? `Ajuda de custo informada · ${EQUIPMENT_LABEL[item.equipmentType]}` : `Comissão recebida sobre ${money.format(item.freightValue)}`}</small></div>
            <button className="icon-button danger-icon" aria-label={`Excluir ${freightLabel(item)}`} onClick={(event) => { event.stopPropagation(); onRemove(item.id); }}><Trash2 size={17} /></button>
            <Spotlight />
          </m.article>
        ))}
      </AnimatePresence>
    </m.div>
  );
}
function AnimatedRoutePoints() {
  return (
    <div className="route-points" aria-hidden="true">
      <m.i initial={{ scale: .6, opacity: .45 }} whileInView={{ scale: 1, opacity: 1 }} viewport={{ once: true }} transition={{ duration: .24 }} />
      <m.span className="route-line-motion" initial={{ scaleY: 0 }} whileInView={{ scaleY: 1 }} viewport={{ once: true, amount: .6 }} transition={{ duration: .46, delay: .08, ease: [0.22, 1, 0.36, 1] }} />
      <m.i className="route-destination-motion" initial={{ scale: .65, opacity: .45 }} whileInView={{ scale: 1, opacity: 1 }} viewport={{ once: true }} transition={{ type: "spring", stiffness: 430, damping: 24, delay: .36 }} />
    </div>
  );
}
function StatusBadge({ status }: { status: string }) {
  const key = status.toLocaleLowerCase("pt-BR");
  const tone = key.includes("concl") || key === "ativa" || key.includes("recebid") ? "success" : key.includes("pend") ? "warning" : key.includes("cancel") || key === "inativa" ? "error" : "info";
  return <span className={`status-badge ${tone}`}><i>{tone === "success" ? <Check size={10} /> : "!"}</i>{status}</span>;
}

function EmptyState({ icon, title, copy, action, onAction, mini = false }: { icon: ReactNode; title: string; copy: string; action: string; onAction: () => void; mini?: boolean }) {
  return <div className={`card empty-state ${mini ? "mini" : ""}`}><div className="empty-icon">{icon}</div><strong>{title}</strong><p>{copy}</p><button className="button primary" onClick={onAction}><Plus size={17} /> {action}</button></div>;
}

function MiniEmpty({ copy }: { copy: string }) {
  return <div className="mini-empty"><BarChart3 size={24} /><span>{copy}</span></div>;
}

function ModalHeader({ icon, title, copy, onClose }: { icon: ReactNode; title: string; copy: string; onClose: () => void }) {
  return <div className="modal-head"><div className="modal-title"><span>{icon}</span><div><h2 id="freight-details-title">{title}</h2><small>{copy}</small></div></div><button type="button" className="icon-button" aria-label="Fechar" onClick={onClose}><X size={19} /></button></div>;
}

function Field({ label, required = false, full = false, children }: { label: string; required?: boolean; full?: boolean; children: ReactNode }) {
  return <div className={`field ${full ? "full" : ""}`}><label>{label}{required && <b> *</b>}</label>{children}</div>;
}
function DashboardSkeleton() {
  return <div className="dashboard-loading-stage" role="status" aria-live="polite" aria-label="Carregando painel"><div className="ai-loader-wrapper" aria-hidden="true"><span className="ai-loader-letter">C</span><span className="ai-loader-letter">a</span><span className="ai-loader-letter">r</span><span className="ai-loader-letter">r</span><span className="ai-loader-letter">e</span><span className="ai-loader-letter">g</span><span className="ai-loader-letter">a</span><span className="ai-loader-letter">n</span><span className="ai-loader-letter">d</span><span className="ai-loader-letter">o</span><div className="ai-loader-orb" /></div><span className="sr-only">Carregando painel</span></div>;
}