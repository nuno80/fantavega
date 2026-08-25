// @vitest-environment node
import { EventEmitter } from "node:events";
import type { WorkerOptions } from "node:worker_threads";
import { describe, expect, it } from "vitest";

import {
  XLSX_WORKER_RESOURCE_LIMITS,
  type XlsxWorkerSpawner,
  createXlsxWorkerReader,
} from "@/lib/import/xlsx-worker-reader";

const options = {
  limits: {
    maxSheets: 4,
    maxRowsPerSheet: 2_000,
    maxColumnsPerSheet: 32,
    maxCellsPerWorkbook: 50_000,
    maxCellTextLength: 4_096,
    maxFormulaLength: 8_192,
  },
  timeoutMs: 50,
  requiredSheetName: "Tutti",
};

class FakeWorker extends EventEmitter {
  terminated = false;
  async terminate(): Promise<number> {
    this.terminated = true;
    return 0;
  }
}

const projected = {
  sheetName: "Tutti",
  rows: [["bounded"]],
  metrics: { sheetCount: 1, rowCount: 1, columnCount: 1, cellCount: 1 },
};

describe("xlsx worker guard", () => {
  it("enforces a deterministic timeout and terminates the worker", async () => {
    const worker = new FakeWorker();
    const reader = createXlsxWorkerReader({
      spawnWorker: (() => worker) as XlsxWorkerSpawner,
    });

    await expect(
      reader(Buffer.from("bytes"), { ...options, timeoutMs: 1 })
    ).rejects.toMatchObject({ code: "PARSE_TIMEOUT" });
    expect(worker.terminated).toBe(true);
  });

  it("rejects excess concurrent parser work as busy", async () => {
    const worker = new FakeWorker();
    const reader = createXlsxWorkerReader({
      maxConcurrency: 1,
      spawnWorker: (() => worker) as XlsxWorkerSpawner,
    });

    const first = reader(Buffer.from("first"), options);
    await expect(reader(Buffer.from("second"), options)).rejects.toMatchObject({
      code: "PARSER_BUSY",
    });
    worker.emit("message", { ok: true, projected });
    await expect(first).resolves.toEqual(projected);
  });

  it("always starts workers with the configured heap and stack guards", async () => {
    const worker = new FakeWorker();
    let workerOptions: WorkerOptions | undefined;
    const reader = createXlsxWorkerReader({
      spawnWorker: ((_source, receivedOptions) => {
        workerOptions = receivedOptions;
        queueMicrotask(() => worker.emit("message", { ok: true, projected }));
        return worker;
      }) as XlsxWorkerSpawner,
    });

    await expect(reader(Buffer.from("bytes"), options)).resolves.toEqual(
      projected
    );
    expect(workerOptions?.resourceLimits).toEqual(XLSX_WORKER_RESOURCE_LIMITS);
    expect(workerOptions?.workerData).not.toHaveProperty("workbook");
  });
});
