import ExcelJS from "exceljs";
import type { ExportFormat, Run } from "@shared/types.ts";
import { badRequest } from "../utils/errors.ts";
import { iterateResults, resultColumns } from "./run-service.ts";

export interface ExportResult {
  body: string | Uint8Array;
  contentType: string;
  filename: string;
}

const FORMATS: ExportFormat[] = ["csv", "json", "xlsx"];

export function parseFormat(raw: string | null): ExportFormat {
  const value = (raw ?? "csv").toLowerCase() as ExportFormat;
  if (!FORMATS.includes(value)) {
    throw badRequest(`Unsupported export format "${raw}". Use one of: ${FORMATS.join(", ")}`);
  }
  return value;
}

/** Turn any cell value into something a flat file can hold. */
function flatten(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.map(flatten).join(" | ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

/** RFC 4180: quote when the value contains a delimiter, quote or newline. */
function csvCell(value: unknown): string {
  const text = flatten(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "results"
  );
}

function baseName(run: Run): string {
  const stamp = (run.finishedAt ?? run.startedAt ?? run.createdAt).slice(0, 19).replaceAll(":", "-");
  return `${slugify(run.scraperName)}-${stamp}`;
}

function toCsv(run: Run, columns: string[]): string {
  const header = ["#", ...columns, "page", "source_url"];
  const lines = [header.map(csvCell).join(",")];

  let index = 0;
  for (const batch of iterateResults(run.id)) {
    for (const row of batch) {
      index++;
      lines.push(
        [index, ...columns.map((column) => row.data?.[column]), row.pageNumber, row.pageUrl].map(csvCell).join(","),
      );
    }
  }
  // The BOM makes Excel open UTF-8 CSV correctly on Windows.
  return `﻿${lines.join("\r\n")}\r\n`;
}

function toJson(run: Run): string {
  const rows: unknown[] = [];
  for (const batch of iterateResults(run.id)) {
    for (const row of batch) {
      rows.push({ ...row.data, _page: row.pageNumber, _sourceUrl: row.pageUrl, _scrapedAt: row.createdAt });
    }
  }

  return JSON.stringify(
    {
      scraper: run.scraperName,
      url: run.url,
      runId: run.id,
      status: run.status,
      startedAt: run.startedAt,
      finishedAt: run.finishedAt,
      pagesProcessed: run.pagesProcessed,
      totalItems: rows.length,
      exportedAt: new Date().toISOString(),
      data: rows,
    },
    null,
    2,
  );
}

async function toXlsx(run: Run, columns: string[]): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "web-scraper";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("Results", {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  sheet.columns = [
    { header: "#", key: "_index", width: 6 },
    ...columns.map((column) => ({ header: column, key: column, width: Math.min(48, Math.max(14, column.length + 8)) })),
    { header: "page", key: "_page", width: 8 },
    { header: "source_url", key: "_sourceUrl", width: 42 },
  ];

  let index = 0;
  for (const batch of iterateResults(run.id)) {
    for (const row of batch) {
      index++;
      const record: Record<string, unknown> = { _index: index, _page: row.pageNumber, _sourceUrl: row.pageUrl };
      for (const column of columns) record[column] = flatten(row.data?.[column]);
      sheet.addRow(record).commit();
    }
  }

  const header = sheet.getRow(1);
  header.font = { bold: true };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F5F9" } };
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: sheet.columnCount } };

  // A second sheet keeps the provenance of the export with the data.
  const meta = workbook.addWorksheet("Run info");
  meta.columns = [
    { header: "Property", key: "k", width: 22 },
    { header: "Value", key: "v", width: 70 },
  ];
  meta.getRow(1).font = { bold: true };
  for (const [k, v] of [
    ["Scraper", run.scraperName],
    ["Target URL", run.url],
    ["Run ID", run.id],
    ["Status", run.status],
    ["Started", run.startedAt ?? ""],
    ["Finished", run.finishedAt ?? ""],
    ["Pages processed", String(run.pagesProcessed)],
    ["Total items", String(index)],
    ["Exported at", new Date().toISOString()],
  ]) {
    meta.addRow({ k, v });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return new Uint8Array(buffer as ArrayBuffer);
}

export async function exportRun(run: Run, format: ExportFormat): Promise<ExportResult> {
  const columns = resultColumns(run.id);
  const name = baseName(run);

  switch (format) {
    case "json":
      return { body: toJson(run), contentType: "application/json; charset=utf-8", filename: `${name}.json` };
    case "xlsx":
      return {
        body: await toXlsx(run, columns),
        contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        filename: `${name}.xlsx`,
      };
    default:
      return { body: toCsv(run, columns), contentType: "text/csv; charset=utf-8", filename: `${name}.csv` };
  }
}

export function toDownloadResponse(result: ExportResult): Response {
  return new Response(result.body as BodyInit, {
    headers: {
      "content-type": result.contentType,
      "content-disposition": `attachment; filename="${result.filename}"`,
      "cache-control": "no-store",
    },
  });
}
