import fs from "node:fs";
import path from "node:path";

import PDFDocument from "pdfkit";

import type {
  PeriodCloseReportDeskRow,
  PeriodCloseReportOperation,
  PeriodCloseReportSnapshot,
} from "@/modules/accounting/domain/period-close-report";

const DARK = "#0D1B14";
const INK = "#132019";
const MUTED = "#748078";
const GREEN = "#63FF2D";
const PALE = "#F2F7F1";
const CARD = "#FFFFFF";
const BORDER = "#D7E1D7";
const ORANGE = "#F5A936";
const RED = "#E45A61";
const MARGIN = 34;
const PAGE_BOTTOM = 780;

function money(cents: number, signed = false): string {
  const amount = Math.abs(cents) / 100;
  const formatted = new Intl.NumberFormat("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
  const sign = cents < 0 ? "-" : signed && cents > 0 ? "+" : "";
  return `${sign}US$ ${formatted}`;
}
function percent(bps: number): string {
  return `${new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 }).format(bps / 100)}%`;
}

function monthLabel(month: string): string {
  const value = new Intl.DateTimeFormat("es-AR", { month: "long", timeZone: "UTC", year: "numeric" })
    .format(new Date(`${month}T00:00:00Z`));
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function shortDate(value: string): string {
  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "America/Argentina/Buenos_Aires",
    year: "2-digit",
  }).format(new Date(value));
}

function time(value: string): string {
  return new Intl.DateTimeFormat("es-AR", {
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    timeZone: "America/Argentina/Buenos_Aires",
  }).format(new Date(value));
}

function dayLabel(value: string): string {
  return new Intl.DateTimeFormat("es-AR", {
    day: "numeric",
    month: "short",
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
  }).format(new Date(value));
}

function roundedRect(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  width: number,
  height: number,
  fill = CARD,
  stroke = BORDER,
  radius = 8,
) {
  doc.roundedRect(x, y, width, height, radius).fillAndStroke(fill, stroke);
}

function logoPath(): string | null {
  const candidate = path.join(process.cwd(), "public", "nodal-trading-lime.png");
  return fs.existsSync(candidate) ? candidate : null;
}

function drawLogo(doc: PDFKit.PDFDocument, x: number, y: number, width: number) {
  const logo = logoPath();
  if (logo) doc.image(logo, x, y, { width });
  else doc.fillColor(GREEN).font("Helvetica-Bold").fontSize(17).text("NODAL TRADING", x, y, { width });
}

function pageHeader(doc: PDFKit.PDFDocument, section: string, month: string) {
  doc.rect(0, 0, doc.page.width, 84).fill(DARK);
  drawLogo(doc, MARGIN, 25, 160);
  doc.fillColor(GREEN).font("Helvetica-Bold").fontSize(8.5).text(section.toUpperCase(), 360, 28, { align: "right", width: 200 });
  doc.fillColor("#E6EEE8").font("Helvetica").fontSize(7.5).text(monthLabel(month).toUpperCase(), 360, 48, { align: "right", width: 200 });
}

function sectionTitle(doc: PDFKit.PDFDocument, title: string, subtitle: string, y: number): number {
  doc.fillColor(INK).font("Helvetica-Bold").fontSize(16).text(title, MARGIN, y);
  doc.fillColor(MUTED).font("Helvetica").fontSize(7.6).text(subtitle, MARGIN, y + 27);
  doc.rect(MARGIN, y + 46, 35, 2).fill(GREEN);
  return y + 64;
}

function newContentPage(doc: PDFKit.PDFDocument, section: string, month: string): number {
  doc.addPage();
  doc.rect(0, 0, doc.page.width, doc.page.height).fill(PALE);
  pageHeader(doc, section, month);
  return 112;
}

function drawCover(doc: PDFKit.PDFDocument, snapshot: PeriodCloseReportSnapshot) {
  const { summary } = snapshot;
  doc.rect(0, 0, doc.page.width, doc.page.height).fill(PALE);
  doc.rect(0, 0, doc.page.width, 204).fill(DARK);
  drawLogo(doc, MARGIN, 31, 190);
  doc.fillColor(GREEN).font("Helvetica-Bold").fontSize(9).text("CIERRE DE PERÍODO", MARGIN, 98);
  doc.fillColor("white").font("Helvetica-Bold").fontSize(27).text(monthLabel(snapshot.period.month), MARGIN, 119);
  doc.fontSize(12.5).text(snapshot.owner.name, MARGIN, 153);
  doc.fillColor("#BCC7BF").font("Helvetica").fontSize(8.8).text(
    `Período operativo: ${dayLabel(`${snapshot.period.operationalStartOn}T12:00:00-03:00`)} - ${dayLabel(snapshot.period.scheduledCloseAt)} - corte contable: ${time(snapshot.period.scheduledCloseAt)}`,
    MARGIN,
    181,
  );

  const gap = 10;
  const cardWidth = (doc.page.width - MARGIN * 2 - gap * 2) / 3;
  const metrics = [
    ["RESULTADO REALIZADO", money(summary.realizedGainInCents, true), "Solo cuentas cerradas", INK],
    ["COMISIÓN NODAL", money(-summary.commissionInCents, true), `${summary.commissionRateLabel} - congelada al cierre`, RED],
    ["GANANCIA USUARIO", money(summary.traderGainInCents, true), "Neto del período", INK],
  ] as const;
  metrics.forEach(([label, value, note, color], index) => {
    const x = MARGIN + index * (cardWidth + gap);
    roundedRect(doc, x, 224, cardWidth, 86);
    doc.fillColor(MUTED).font("Helvetica-Bold").fontSize(7.4).text(label, x + 14, 241);
    doc.fillColor(color).font("Helvetica-Bold").fontSize(16).text(value, x + 14, 265, { width: cardWidth - 28 });
    doc.fillColor(MUTED).font("Helvetica").fontSize(7.3).text(note, x + 14, 292, { width: cardWidth - 28 });
  });

  doc.fillColor(MUTED).font("Helvetica-Bold").fontSize(7.5).text("PANORAMA", MARGIN, 342);
  doc.fillColor(INK).fontSize(15.5).text("Posición y continuidad", MARGIN, 357);
  doc.rect(MARGIN, 381, 35, 2).fill(GREEN);
  const smallGap = 8;
  const smallWidth = (doc.page.width - MARGIN * 2 - smallGap * 3) / 4;
  const positions = [
    ["Saldo broker", summary.brokerBalanceInCents === null ? "Sin dato" : money(summary.brokerBalanceInCents), GREEN],
    ["Billeteras", money(summary.walletBalanceInCents), GREEN],
    ["Retiros pendientes", money(summary.fundingPendingInCents), ORANGE],
    ["Posición observable", money(summary.positionObservableInCents), GREEN],
  ] as const;
  positions.forEach(([label, value, color], index) => {
    const x = MARGIN + index * (smallWidth + smallGap);
    roundedRect(doc, x, 398, smallWidth, 64);
    doc.roundedRect(x + 10, 411, 4, 38, 2).fill(color);
    doc.fillColor(MUTED).font("Helvetica").fontSize(7.2).text(label, x + 24, 416, { width: smallWidth - 34 });
    doc.fillColor(INK).font("Helvetica-Bold").fontSize(10.5).text(value, x + 24, 439, { width: smallWidth - 34 });
  });

  roundedRect(doc, MARGIN, 500, doc.page.width - MARGIN * 2, 136);
  doc.fillColor(MUTED).font("Helvetica-Bold").fontSize(8).text("ESTADO DE LAS CUENTAS AL CORTE", MARGIN + 16, 519);
  const states = [
    [String(summary.accountStates.closed), "Cerradas", "Se computan", GREEN],
    [String(summary.accountStates.live), "Vivas trasladadas", "Pasan al período siguiente", ORANGE],
    [String(summary.accountStates.virgin), "Vírgenes", "Pasan al período siguiente", "#AEBAB0"],
  ] as const;
  states.forEach(([number, label, note, color], index) => {
    const cx = MARGIN + 42 + index * 132;
    doc.circle(cx, 575, 18).fill(color);
    doc.fillColor(INK).font("Helvetica-Bold").fontSize(12).text(number, cx - 18, 568, { align: "center", width: 36 });
    doc.fontSize(8.5).text(label, cx + 28, 566, { width: 95 });
    doc.fillColor(MUTED).font("Helvetica").fontSize(7.2).text(note, cx + 28, 585, { width: 100 });
  });
  doc.roundedRect(doc.page.width - MARGIN - 112, 523, 96, 89, 10).fill("#E8F1E5");
  doc.fillColor(MUTED).font("Helvetica-Bold").fontSize(7.4).text("FLOTANTE", doc.page.width - MARGIN - 98, 542);
  doc.fillColor(INK).fontSize(13).text(money(summary.floatingInCents), doc.page.width - MARGIN - 98, 570, { width: 82 });
  doc.fillColor(MUTED).font("Helvetica").fontSize(6.7).text("Trasladado íntegramente", doc.page.width - MARGIN - 98, 594, { width: 82 });
}

const OP_COLUMNS = [34, 78, 122, 252, 309, 335, 408, 493, 561];

function operationTableHeader(doc: PDFKit.PDFDocument, y: number) {
  doc.roundedRect(OP_COLUMNS[0], y, OP_COLUMNS.at(-1)! - OP_COLUMNS[0], 28, 6).fill(DARK);
  const headers = ["FECHA", "EMPRESA", "CUENTAS PROP", "IDENTIDAD", "CTAS.", "FASE / DÍA", "ÚLTIMO TRADE"];
  headers.forEach((header, index) => {
    doc.fillColor(GREEN).font("Helvetica-Bold").fontSize(5.6).text(header, OP_COLUMNS[index] + 5, y + 10, {
      width: OP_COLUMNS[index + 1] - OP_COLUMNS[index] - 8,
    });
  });
  doc.text("RESULTADO", OP_COLUMNS[7] + 4, y + 10, { align: "right", width: OP_COLUMNS[8] - OP_COLUMNS[7] - 9 });
}

function operationRowHeight(operation: PeriodCloseReportOperation): number {
  return Math.max(38, 17 + operation.accounts.length * 10.2);
}

function drawOperationRow(doc: PDFKit.PDFDocument, operation: PeriodCloseReportOperation, y: number, alternate: boolean): number {
  const height = operationRowHeight(operation);
  roundedRect(doc, OP_COLUMNS[0], y, OP_COLUMNS.at(-1)! - OP_COLUMNS[0], height, alternate ? "#EDF4EC" : CARD, alternate ? "#EDF4EC" : CARD, 5);
  doc.roundedRect(OP_COLUMNS[0] + 4, y + 5, 3, height - 10, 1.5).fill(GREEN);
  const middle = y + height / 2;
  doc.fillColor(INK).font("Helvetica-Bold").fontSize(6.2).text(shortDate(operation.openedAt), OP_COLUMNS[0] + 9, middle - 9, { width: 42 });
  doc.fillColor(MUTED).font("Helvetica").fontSize(5.8).text(time(operation.openedAt), OP_COLUMNS[0] + 9, middle + 1, { width: 42 });
  doc.fillColor(INK).font("Helvetica-Bold").fontSize(6.3).text(operation.company, OP_COLUMNS[1] + 5, middle - 3, { width: 38 });
  let accountY = middle - ((operation.accounts.length - 1) * 10.2) / 2 - 3;
  operation.accounts.forEach((account) => {
    doc.fillColor(INK).font("Helvetica").fontSize(6.1).text(account, OP_COLUMNS[2] + 5, accountY, { lineBreak: false, width: 125 });
    accountY += 10.2;
  });
  doc.fillColor(INK).font("Helvetica").fontSize(6.1).text(operation.identityName, OP_COLUMNS[3] + 5, middle - 3, { width: 52 });
  doc.font("Helvetica-Bold").fontSize(6.7).text(String(operation.accountCount), OP_COLUMNS[4], middle - 3, { align: "center", width: OP_COLUMNS[5] - OP_COLUMNS[4] });
  doc.fillColor(MUTED).font("Helvetica").fontSize(5.9).text(operation.phaseDay, OP_COLUMNS[5] + 5, middle - 3, { width: 68 });
  doc.fillColor(INK).font("Helvetica-Bold").fontSize(5.8).text(operation.brokerAccount ?? "Sin broker", OP_COLUMNS[6] + 5, middle - 9, { width: 76 });
  const trade = `${operation.instruments.join(", ") || "Sin instrumento"} - ${operation.executionCount} ejec.`;
  doc.fillColor(MUTED).font("Helvetica").fontSize(5.4).text(trade, OP_COLUMNS[6] + 5, middle + 1, { width: 76 });
  doc.fillColor(INK).font("Helvetica-Bold").fontSize(6.4).text(money(operation.finalResultInCents, true), OP_COLUMNS[7] + 4, middle - 3, {
    align: "right",
    width: OP_COLUMNS[8] - OP_COLUMNS[7] - 9,
  });
  return y + height + 3;
}

function drawOperations(doc: PDFKit.PDFDocument, snapshot: PeriodCloseReportSnapshot) {
  let y = newContentPage(doc, "Detalle de cuentas", snapshot.period.month);
  y = sectionTitle(doc, "Cuentas cerradas en el período", "Extracto del historial - operaciones ordenadas por fecha descendente", y);
  operationTableHeader(doc, y);
  y += 30;
  snapshot.operations.forEach((operation, index) => {
    const height = operationRowHeight(operation);
    if (y + height > PAGE_BOTTOM) {
      y = newContentPage(doc, "Detalle de cuentas", snapshot.period.month);
      y = sectionTitle(doc, "Cuentas cerradas en el período", "Continuación del extracto del historial", y);
      operationTableHeader(doc, y);
      y += 30;
    }
    y = drawOperationRow(doc, operation, y, index % 2 === 1);
  });
  doc.moveTo(MARGIN, y + 8).lineTo(doc.page.width - MARGIN, y + 8).strokeColor(BORDER).lineWidth(1).stroke();
  const totalAccounts = snapshot.operations.reduce((total, operation) => total + operation.accountCount, 0);
  doc.fillColor(MUTED).font("Helvetica-Bold").fontSize(8).text(`${totalAccounts} cuentas cerradas - ${snapshot.operations.length} coberturas`, MARGIN + 8, y + 15);
  doc.fillColor(INK).fontSize(11).text(money(snapshot.summary.realizedGainInCents, true), 400, y + 12, { align: "right", width: 160 });
}

function identityCard(doc: PDFKit.PDFDocument, x: number, y: number, width: number, identity: PeriodCloseReportSnapshot["identities"][number]) {
  roundedRect(doc, x, y, width, 75);
  doc.roundedRect(x + 10, y + 12, 4, 51, 2).fill(GREEN);
  doc.fillColor(INK).font("Helvetica-Bold").fontSize(10).text(identity.name, x + 24, y + 15, { width: width - 38 });
  doc.fillColor(MUTED).font("Helvetica").fontSize(7.2).text(`Cuentas operadas: ${identity.accountCount}`, x + 24, y + 38);
  const payouts = identity.payoutsByCompany.length
    ? identity.payoutsByCompany.map((item) => `${item.company} ${item.count}`).join(" - ")
    : "Sin payouts";
  doc.text(`Payouts: ${payouts}`, x + 24, y + 54, { width: width - 120 });
  doc.fillColor(INK).font("Helvetica-Bold").fontSize(10.2).text(money(identity.gainInCents, true), x + width - 130, y + 52, { align: "right", width: 116 });
}

function deskTableHeader(doc: PDFKit.PDFDocument, y: number) {
  const xs = [24, 130, 174, 217, 260, 302, 379, 445, 510, 571];
  const heads = [
    ["INTEGRANTE", "DE MESA"], ["%", "INTEGRANTE"], ["%", "ADMIN"], ["%", "NODAL"],
    ["CTAS.", "CERRADAS"], ["TOTAL", "FACTURADO"], ["COMISIÓN", "INTEGRANTE"],
    ["COMISIÓN", "ADMIN"], ["COMISIÓN", "NODAL"],
  ];
  doc.roundedRect(24, y, 547, 36, 6).fill(DARK);
  heads.forEach(([first, second], index) => {
    const center = (xs[index] + xs[index + 1]) / 2;
    const options = index === 0
      ? { align: "left" as const, width: xs[index + 1] - xs[index] - 10 }
      : { align: "center" as const, width: xs[index + 1] - xs[index] };
    const x = index === 0 ? xs[index] + 5 : xs[index];
    doc.fillColor(GREEN).font("Helvetica-Bold").fontSize(4.9).text(first, x, y + 10, options);
    doc.text(second, x, y + 21, options);
    void center;
  });
  return xs;
}

function drawDeskRow(doc: PDFKit.PDFDocument, row: PeriodCloseReportDeskRow, y: number, alternate: boolean, xs: readonly number[]) {
  roundedRect(doc, 24, y, 547, 29, alternate ? "#EDF4EC" : CARD, alternate ? "#EDF4EC" : CARD, 4);
  doc.fillColor(INK).font("Helvetica-Bold").fontSize(6).text(row.memberName, xs[0] + 5, y + 10, { width: xs[1] - xs[0] - 10 });
  [row.memberBps, row.administratorBps, row.nodalBps].forEach((bps, index) => {
    doc.font("Helvetica").fontSize(5.8).text(percent(bps), xs[index + 1], y + 10, { align: "center", width: xs[index + 2] - xs[index + 1] });
  });
  doc.text(String(row.accountsClosed), xs[4], y + 10, { align: "center", width: xs[5] - xs[4] });
  [row.billedInCents, row.memberCommissionInCents, row.administratorCommissionInCents, row.nodalCommissionInCents].forEach((amount, index) => {
    doc.fillColor(INK).font(index === 3 ? "Helvetica-Bold" : "Helvetica").fontSize(5.6).text(money(amount), xs[index + 5], y + 10, {
      align: "right",
      width: xs[index + 6] - xs[index + 5] - 5,
    });
  });
}

function drawManagement(doc: PDFKit.PDFDocument, snapshot: PeriodCloseReportSnapshot) {
  let y = newContentPage(doc, "Resumen de gestión", snapshot.period.month);
  y = sectionTitle(doc, "Rendimiento por identidad", "Cuentas operadas, payouts y ganancia atribuida durante el período", y);
  const gap = 9;
  const width = (doc.page.width - MARGIN * 2 - gap) / 2;
  snapshot.identities.forEach((identity, index) => {
    const column = index % 2;
    if (column === 0 && y + 75 > PAGE_BOTTOM) {
      y = newContentPage(doc, "Resumen de gestión", snapshot.period.month);
      y = sectionTitle(doc, "Rendimiento por identidad", "Continuación", y);
    }
    identityCard(doc, MARGIN + column * (width + gap), y, width, identity);
    if (column === 1 || index === snapshot.identities.length - 1) y += 84;
  });

  if (!snapshot.desk) return;
  if (y + 190 > PAGE_BOTTOM) y = newContentPage(doc, "Resumen de gestión", snapshot.period.month);
  doc.fillColor(INK).font("Helvetica-Bold").fontSize(15).text("Mesa del titular", MARGIN, y + 6);
  doc.fillColor(MUTED).font("Helvetica").fontSize(7.3).text("El integrante recibe su porcentaje; la comisión restante se distribuye entre el administrador y NODAL", MARGIN, y + 29);
  doc.rect(MARGIN, y + 50, 35, 2).fill(GREEN);
  y += 68;
  let xs = deskTableHeader(doc, y);
  y += 38;
  snapshot.desk.rows.forEach((row, index) => {
    if (y + 29 > PAGE_BOTTOM) {
      y = newContentPage(doc, "Mesa del titular", snapshot.period.month);
      xs = deskTableHeader(doc, y);
      y += 38;
    }
    drawDeskRow(doc, row, y, index % 2 === 1, xs);
    y += 30;
  });
  const totals = snapshot.desk.rows.reduce((result, row) => ({
    accounts: result.accounts + row.accountsClosed,
    administrator: result.administrator + row.administratorCommissionInCents,
    billed: result.billed + row.billedInCents,
    member: result.member + row.memberCommissionInCents,
    nodal: result.nodal + row.nodalCommissionInCents,
  }), { accounts: 0, administrator: 0, billed: 0, member: 0, nodal: 0 });
  doc.moveTo(24, y + 4).lineTo(571, y + 4).strokeColor(BORDER).lineWidth(1).stroke();
  doc.fillColor(MUTED).font("Helvetica-Bold").fontSize(6.5).text(`TOTAL - ${totals.accounts} CUENTAS`, 29, y + 11, { width: 200 });
  [totals.billed, totals.member, totals.administrator, totals.nodal].forEach((amount, index) => {
    doc.fillColor(index === 3 ? RED : INK).font("Helvetica-Bold").fontSize(6).text(money(amount), xs[index + 5], y + 11, {
      align: "right",
      width: xs[index + 6] - xs[index + 5] - 5,
    });
  });
}

function drawFooters(doc: PDFKit.PDFDocument) {
  const range = doc.bufferedPageRange();
  for (let index = range.start; index < range.start + range.count; index += 1) {
    doc.switchToPage(index);
    const y = doc.page.height - 42;
    doc.rect(0, y, doc.page.width, 42).fill(DARK);
    drawLogo(doc, MARGIN, y + 10, 118);
    doc.fillColor("#E6EEE8").font("Helvetica").fontSize(8.3).text("contacto@nodaltrading.com", 195, y + 15, { align: "center", width: 205 });
    doc.text("nodaltrading.com", 430, y + 15, { align: "right", width: 130 });
    doc.fillColor("#90A096").fontSize(6.5).text(`Página ${index + 1} de ${range.count}`, 430, y + 29, { align: "right", width: 130 });
  }
}

export async function renderPeriodCloseReport(snapshot: PeriodCloseReportSnapshot): Promise<Buffer> {
  const doc = new PDFDocument({
    autoFirstPage: true,
    bufferPages: true,
    info: {
      Author: "NODAL Trading",
      Subject: `Cierre de período ${monthLabel(snapshot.period.month)}`,
      Title: `Cierre de período - ${snapshot.owner.name}`,
    },
    margin: 0,
    size: "A4",
  });
  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const completed = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
  drawCover(doc, snapshot);
  drawOperations(doc, snapshot);
  drawManagement(doc, snapshot);
  drawFooters(doc);
  doc.end();
  return completed;
}

