"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { formatMoney, parseMoneyToMinor, parseQty } from "@/lib/money";

/**
 * The line grid used by client documents, vendor POs and invoices.
 *
 * Built for speed, because a PM lives in this control:
 *   Tab      move across   Enter  add a row below
 *   Ctrl+D   fill down from the row above
 *   Paste    a block copied from Excel fills multiple rows and columns at once
 *
 * Rows are serialised into one hidden input as JSON; the server action parses and
 * validates them with the zod schemas, so the browser is never the source of truth.
 */

export type ColumnType = "text" | "qty" | "money" | "percent";

export type EditorColumn = {
  key: string;
  label: string;
  type: ColumnType;
  width?: string;
  placeholder?: string;
  readOnly?: boolean;
};

export type EditorRow = Record<string, string>;

export function LineItemsEditor({
  name,
  columns,
  initialRows,
  currency = "USD",
  qtyKey = "quantity",
  priceKey = "unitPrice",
  taxKey = "taxRatePct",
  addLabel = "Add line",
  emptyMessage = "No lines yet.",
  onRowsChange,
}: {
  name: string;
  columns: EditorColumn[];
  initialRows?: EditorRow[];
  currency?: string;
  qtyKey?: string;
  priceKey?: string;
  taxKey?: string;
  addLabel?: string;
  emptyMessage?: string;
  onRowsChange?: (rows: EditorRow[]) => void;
}) {
  const blankRow = useMemo<EditorRow>(
    () => Object.fromEntries(columns.map((column) => [column.key, ""])),
    [columns],
  );

  const [rows, setRows] = useState<EditorRow[]>(() =>
    initialRows && initialRows.length > 0 ? initialRows.map((row) => ({ ...blankRow, ...row })) : [{ ...blankRow }],
  );
  const gridRef = useRef<HTMLTableSectionElement>(null);

  const update = useCallback(
    (next: EditorRow[]) => {
      setRows(next);
      onRowsChange?.(next);
    },
    [onRowsChange],
  );

  const setCell = (rowIndex: number, key: string, value: string) => {
    const next = rows.map((row, index) => (index === rowIndex ? { ...row, [key]: value } : row));
    update(next);
  };

  const addRow = (afterIndex?: number) => {
    const next = [...rows];
    const position = afterIndex === undefined ? next.length : afterIndex + 1;
    next.splice(position, 0, { ...blankRow });
    update(next);
    // Focus the first editable cell of the new row once React has painted it.
    requestAnimationFrame(() => {
      const input = gridRef.current?.querySelector<HTMLInputElement>(`[data-cell="${position}-0"]`);
      input?.focus();
    });
  };

  const removeRow = (rowIndex: number) => {
    const next = rows.filter((_, index) => index !== rowIndex);
    update(next.length > 0 ? next : [{ ...blankRow }]);
  };

  const fillDown = (rowIndex: number, key: string) => {
    if (rowIndex === 0) return;
    setCell(rowIndex, key, rows[rowIndex - 1][key] ?? "");
  };

  /** Excel paste: a tab/newline separated block spreads across cells from here. */
  const handlePaste = (event: React.ClipboardEvent<HTMLInputElement>, rowIndex: number, colIndex: number) => {
    const text = event.clipboardData.getData("text/plain");
    if (!text.includes("\t") && !text.includes("\n")) return; // single value — let the browser handle it

    event.preventDefault();
    const matrix = text
      .replace(/\r/g, "")
      .split("\n")
      .filter((line) => line.length > 0)
      .map((line) => line.split("\t"));

    const next = [...rows];
    matrix.forEach((cells, rowOffset) => {
      const targetIndex = rowIndex + rowOffset;
      if (!next[targetIndex]) next[targetIndex] = { ...blankRow };
      cells.forEach((cell, colOffset) => {
        const column = columns[colIndex + colOffset];
        if (!column || column.readOnly) return;
        next[targetIndex] = { ...next[targetIndex], [column.key]: cell.trim() };
      });
    });
    update(next);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>, rowIndex: number, key: string) => {
    if (event.key === "Enter") {
      event.preventDefault();
      addRow(rowIndex);
      return;
    }
    if (event.key.toLowerCase() === "d" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      fillDown(rowIndex, key);
    }
  };

  const rowTotalMinor = (row: EditorRow) => {
    const qty = parseQty(row[qtyKey] ?? "");
    const price = parseMoneyToMinor(row[priceKey] ?? "");
    return Math.round(qty * price);
  };

  const hasMoneyColumn = columns.some((column) => column.key === priceKey);
  const subtotalMinor = hasMoneyColumn ? rows.reduce((sum, row) => sum + rowTotalMinor(row), 0) : 0;
  const taxTotalMinor = hasMoneyColumn
    ? rows.reduce((sum, row) => {
        const rate = Number(row[taxKey] ?? 0);
        return sum + (Number.isFinite(rate) ? Math.round(rowTotalMinor(row) * (rate / 100)) : 0);
      }, 0)
    : 0;

  return (
    <div>
      <input type="hidden" name={name} value={JSON.stringify(rows)} />

      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="table">
          <thead>
            <tr>
              <th className="w-10 text-center">#</th>
              {columns.map((column) => (
                <th
                  key={column.key}
                  className={column.type === "text" ? "" : "num text-right"}
                  style={column.width ? { width: column.width } : undefined}
                >
                  {column.label}
                </th>
              ))}
              {hasMoneyColumn && <th className="num w-32 text-right">Line total</th>}
              <th className="w-10" />
            </tr>
          </thead>
          <tbody ref={gridRef}>
            {rows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                <td className="text-center text-xs text-slate-400">{rowIndex + 1}</td>
                {columns.map((column, colIndex) => (
                  <td key={column.key} className={column.type === "text" ? "" : "num"}>
                    <input
                      data-cell={`${rowIndex}-${colIndex}`}
                      className={`grid-input ${column.type === "text" ? "" : "text-right tabular"}`}
                      value={row[column.key] ?? ""}
                      placeholder={column.placeholder}
                      readOnly={column.readOnly}
                      inputMode={column.type === "text" ? "text" : "decimal"}
                      onChange={(event) => setCell(rowIndex, column.key, event.target.value)}
                      onKeyDown={(event) => handleKeyDown(event, rowIndex, column.key)}
                      onPaste={(event) => handlePaste(event, rowIndex, colIndex)}
                    />
                  </td>
                ))}
                {hasMoneyColumn && (
                  <td className="num text-right text-slate-600 tabular">{formatMoney(rowTotalMinor(row), currency)}</td>
                )}
                <td className="text-center">
                  <button
                    type="button"
                    onClick={() => removeRow(rowIndex)}
                    className="rounded p-1 text-slate-400 transition hover:bg-red-50 hover:text-red-600"
                    aria-label={`Remove line ${rowIndex + 1}`}
                    title="Remove line"
                  >
                    ×
                  </button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={columns.length + 3} className="py-6 text-center text-sm text-slate-500">
                  {emptyMessage}
                </td>
              </tr>
            )}
          </tbody>
          {hasMoneyColumn && (
            <tfoot>
              <tr className="border-t border-slate-200 bg-slate-50 text-sm">
                <td colSpan={columns.length + 1} className="px-4 py-2 text-right font-medium text-slate-600">
                  Net
                </td>
                <td className="px-4 py-2 text-right font-semibold text-slate-900 tabular">
                  {formatMoney(subtotalMinor, currency)}
                </td>
                <td />
              </tr>
              {taxTotalMinor > 0 && (
                <tr className="bg-slate-50 text-sm">
                  <td colSpan={columns.length + 1} className="px-4 py-2 text-right font-medium text-slate-600">
                    Tax
                  </td>
                  <td className="px-4 py-2 text-right text-slate-700 tabular">{formatMoney(taxTotalMinor, currency)}</td>
                  <td />
                </tr>
              )}
              {taxTotalMinor > 0 && (
                <tr className="bg-slate-50 text-sm">
                  <td colSpan={columns.length + 1} className="px-4 py-2 text-right font-medium text-slate-600">
                    Gross
                  </td>
                  <td className="px-4 py-2 text-right font-semibold text-slate-900 tabular">
                    {formatMoney(subtotalMinor + taxTotalMinor, currency)}
                  </td>
                  <td />
                </tr>
              )}
            </tfoot>
          )}
        </table>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => addRow()} className="btn-secondary btn-sm">
          + {addLabel}
        </button>
        <p className="text-xs text-slate-500">
          <kbd className="rounded border border-slate-300 bg-slate-50 px-1">Enter</kbd> new row ·{" "}
          <kbd className="rounded border border-slate-300 bg-slate-50 px-1">Ctrl+D</kbd> fill down · paste a block from
          Excel
        </p>
      </div>
    </div>
  );
}
