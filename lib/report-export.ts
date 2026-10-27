import type { Cell, Row, SheetData } from "write-excel-file/browser";
import { DRIVER_NAME, EQUIPMENT_LABEL, type Freight } from "./freight-types";

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const date = new Intl.DateTimeFormat("pt-BR");
const dateTime = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });

function parseDate(value: string) {
  return new Date(`${value}T12:00:00`);
}

function parseLoadingAt(value: string, fallbackDate: string) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? parseDate(fallbackDate) : parsed;
}

function safeFileDate(value: string) {
  return value.replaceAll("-", "");
}

function freightStatus(value: string) {
  const normalized = value.toLocaleLowerCase("pt-BR");
  if (normalized.includes("concl")) return "Concluído";
  if (normalized.includes("cancel")) return "Cancelado";
  return "Pendente";
}

export function reportTotals(freights: Freight[]) {
  const freightTotal = freights.reduce((sum, item) => sum + item.freightValue, 0);
  const commissionTotal = freights.reduce((sum, item) => sum + item.commissionValue, 0);
  return {
    count: freights.length,
    bitremCount: freights.filter((item) => item.equipmentType === "bitrem_30m").length,
    lsCount: freights.filter((item) => item.equipmentType === "carreta_ls").length,
    freightTotal,
    commissionTotal,
    commissionReceived: commissionTotal,
  };
}

export function formatPeriod(start: string, end: string) {
  return `${date.format(parseDate(start))} a ${date.format(parseDate(end))}`;
}

export async function exportFreightsPdf(freights: Freight[], start: string, end: string) {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);
  const totals = reportTotals(freights);
  const document = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageWidth = document.internal.pageSize.getWidth();
  const pageHeight = document.internal.pageSize.getHeight();
  const generatedAt = new Date();
  const carriers = Array.from(new Set(freights.map((item) => item.carrierName).filter(Boolean))).join(", ") || "Não informada";
  const headerColor: [number, number, number] = [6, 27, 51];
  const accentColor: [number, number, number] = [10, 101, 189];

  function drawHeader() {
    document.setFillColor(...headerColor);
    document.rect(0, 0, pageWidth, 35, "F");
    document.setTextColor(255, 255, 255);
    document.setFont("helvetica", "bold");
    document.setFontSize(17);
    document.text("GALVÃO EXPRESS", 14, 10);
    document.setFont("helvetica", "normal");
    document.setFontSize(8.5);
    document.setTextColor(194, 218, 236);
    document.text("Relatório de Fretes e Comissões", 14, 17);
    document.text(`Motorista: ${DRIVER_NAME}`, 14, 23);
    document.text(`Período: ${formatPeriod(start, end)}  •  Transportadora: ${carriers}`, 14, 29);
    document.setTextColor(255, 255, 255);
    document.text(`Gerado em ${date.format(generatedAt)} às ${generatedAt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`, pageWidth - 14, 18, { align: "right" });
  }

  drawHeader();

  const cards = [
    ["FRETES", String(totals.count)],
    ["VALOR TOTAL", money.format(totals.freightTotal)],
    ["BITREM / LS", `${totals.bitremCount} / ${totals.lsCount}`],
    ["COMISSÕES", money.format(totals.commissionTotal)],
  ];
  const gap = 3;
  const cardWidth = (pageWidth - 28 - gap * 3) / 4;
  cards.forEach(([label, value], index) => {
    const x = 14 + index * (cardWidth + gap);
    document.setFillColor(240, 248, 255);
    document.setDrawColor(205, 229, 247);
    document.roundedRect(x, 40, cardWidth, 21, 2.5, 2.5, "FD");
    document.setTextColor(...accentColor);
    document.setFont("helvetica", "bold");
    document.setFontSize(6.5);
    document.text(label, x + 3.5, 47);
    document.setTextColor(...headerColor);
    document.setFontSize(11.5);
    document.text(value, x + 3.5, 55);
  });

  autoTable(document, {
    startY: 67,
    margin: { left: 8, right: 8, top: 38, bottom: 14 },
    head: [["Carregamento", "CT-e", "Transportadora", "Carreta", "Origem", "Destino", "Valor", "%", "Comissão", "Frete", "Observações"]],
    body: freights.map((item) => [
      dateTime.format(parseLoadingAt(item.loadingAt, item.freightDate)),
      item.cteNumber || "—",
      item.carrierName ?? "—",
      EQUIPMENT_LABEL[item.equipmentType],
      item.origin,
      item.destination,
      money.format(item.freightValue),
      `${item.commissionPercent}%`,
      money.format(item.commissionValue),
      freightStatus(item.status),
      item.notes || "—",
    ]),
    theme: "grid",
    styles: { font: "helvetica", fontSize: 5.8, cellPadding: 1.5, lineColor: [222, 232, 240], lineWidth: 0.12, overflow: "linebreak", valign: "middle" },
    headStyles: { fillColor: headerColor, textColor: [255, 255, 255], fontStyle: "bold" },
    alternateRowStyles: { fillColor: [248, 251, 253] },
    columnStyles: {
      0: { cellWidth: 23 }, 1: { cellWidth: 16 }, 2: { cellWidth: 24 }, 3: { cellWidth: 24 },
      4: { cellWidth: 32 }, 5: { cellWidth: 32 }, 6: { cellWidth: 22, halign: "right" },
      7: { cellWidth: 9, halign: "center" }, 8: { cellWidth: 23, halign: "right" },
      9: { cellWidth: 16 }, 10: { cellWidth: 45 },
    },
    didDrawPage: ({ pageNumber }) => {
      if (pageNumber > 1) drawHeader();
      document.setFontSize(7);
      document.setTextColor(113, 134, 154);
      document.text(`Galvão Express • ${DRIVER_NAME} • Página ${pageNumber}`, pageWidth - 14, pageHeight - 6, { align: "right" });
    },
  });

  document.save(`galvao-express-comissoes-${safeFileDate(start)}-${safeFileDate(end)}.pdf`);
}

export async function exportFreightsXlsx(freights: Freight[], start: string, end: string) {
  const { default: writeExcelFile } = await import("write-excel-file/browser");
  const totals = reportTotals(freights);
  const header = (value: string) => ({ value, fontWeight: "bold" as const, textColor: "#FFFFFF", backgroundColor: "#061B33", align: "center" as const, height: 30 });
  const rowText = (value: string) => ({ value, bottomBorderColor: "#E2EAF0", bottomBorderStyle: "thin" as const, height: 25 });
  const rowNumber = (value: number, format: string) => ({ value, type: Number, format, bottomBorderColor: "#E2EAF0", bottomBorderStyle: "thin" as const, height: 25 });
  const rowDate = (value: Date, format = "dd/mm/yyyy hh:mm") => ({ value, type: Date, format, bottomBorderColor: "#E2EAF0", bottomBorderStyle: "thin" as const, height: 25 });
  const columns = 12;
  const fill = (value: Cell): Row => [value, ...Array.from({ length: columns - 1 }, () => null)];
  const sheet: SheetData = [
    fill({ value: "GALVÃO EXPRESS", columnSpan: columns, fontWeight: "bold" as const, fontSize: 18, textColor: "#FFFFFF", backgroundColor: "#061B33", height: 34 }),
    fill({ value: "Relatório de Fretes e Comissões", columnSpan: columns, fontWeight: "bold" as const, fontSize: 13, textColor: "#07569F", height: 25 }),
    fill({ value: `Motorista: ${DRIVER_NAME}`, columnSpan: columns, textColor: "#17334B", height: 22 }),
    fill({ value: `Período: ${formatPeriod(start, end)}`, columnSpan: columns, textColor: "#3E5A71", height: 22 }),
    [
      { value: "Fretes", fontWeight: "bold" as const, backgroundColor: "#F0F8FF" }, { value: totals.count, type: Number },
      { value: "Bitrem 30 m", fontWeight: "bold" as const, backgroundColor: "#F0F8FF" }, { value: totals.bitremCount, type: Number },
      { value: "Carreta LS", fontWeight: "bold" as const, backgroundColor: "#F0F8FF" }, { value: totals.lsCount, type: Number },
      { value: "Valor total", fontWeight: "bold" as const, backgroundColor: "#F0F8FF" }, { value: totals.freightTotal, type: Number, format: '"R$ "#,##0.00' },
      { value: "Comissões", fontWeight: "bold" as const, backgroundColor: "#F0F8FF" }, { value: totals.commissionTotal, type: Number, format: '"R$ "#,##0.00' },
      null, null,
    ],
    Array.from({ length: columns }, () => null),
    ["Carregamento", "Data", "Número do CT-e", "Transportadora", "Carreta", "Origem", "Destino", "Valor do Frete", "Percentual", "Comissão Recebida", "Status do Frete", "Observações"].map(header),
    ...freights.map((item) => [
      rowDate(parseLoadingAt(item.loadingAt, item.freightDate)),
      rowDate(parseDate(item.freightDate), "dd/mm/yyyy"),
      rowText(item.cteNumber),
      rowText(item.carrierName ?? ""),
      rowText(EQUIPMENT_LABEL[item.equipmentType]),
      rowText(item.origin),
      rowText(item.destination),
      rowNumber(item.freightValue, '"R$ "#,##0.00'),
      rowNumber(item.commissionPercent / 100, "0%"),
      rowNumber(item.commissionValue, '"R$ "#,##0.00'),
      rowText(freightStatus(item.status)),
      rowText(item.notes),
    ]),
  ];

  await writeExcelFile(sheet, {
    sheet: "Fretes e Comissões",
    columns: [
      { width: 20 }, { width: 13 }, { width: 18 }, { width: 25 }, { width: 20 }, { width: 32 },
      { width: 32 }, { width: 18 }, { width: 14 }, { width: 21 }, { width: 17 }, { width: 38 },
    ],
    stickyRowsCount: 7,
    showGridLines: false,
  }, { fontFamily: "Aptos", fontSize: 10 }).toFile(`galvao-express-comissoes-${safeFileDate(start)}-${safeFileDate(end)}.xlsx`);
}
