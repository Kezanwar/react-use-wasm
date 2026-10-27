import { expect, test } from "@playwright/test";

const MS = /\d+(\.\d+)?\s*ms/;
/** toLocaleString inserts group separators, so match the digits loosely. */
const digits = (n: number) => new RegExp(String(n).split("").join("[,.\\s]?"));

test("serves .wasm as application/wasm, so compileStreaming is used", async ({ request }) => {
  const res = await request.get("/math.wasm");
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toBe("application/wasm");
});

test("useWasm computes synchronously during render", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByTestId("add-result")).toHaveText("5");
  await expect(page.getByTestId("scale-result")).toHaveText("10");
});

test("useWasm panel benchmarks JS against wasm on the main thread", async ({ page }) => {
  await page.goto("/");

  const run = page.getByTestId("main-run");
  await expect(run).toBeEnabled({ timeout: 15_000 });

  await page.getByTestId("main-n").fill("30");
  await run.click();

  // Both sides report a timing...
  await expect(page.getByTestId("main-js-ms")).toHaveText(MS, { timeout: 30_000 });
  await expect(page.getByTestId("main-wasm-ms")).toHaveText(MS, { timeout: 30_000 });

  // ...and, more importantly, the same answer.
  await expect(page.getByTestId("main-js-value")).toHaveText(digits(832040));
  await expect(page.getByTestId("main-wasm-value")).toHaveText(digits(832040));

  await expect(page.getByTestId("main-verdict")).toContainText("faster on this run");
});

test("useWasmWorker benchmarks both workers without blocking the main thread", async ({ page }) => {
  await page.goto("/");

  const run = page.getByTestId("worker-run");
  await expect(run).toBeEnabled({ timeout: 15_000 });

  await page.getByTestId("worker-n").fill("40");

  const frames = async () =>
    Number((await page.getByTestId("frames").innerText()).replace(/\D/g, ""));
  const before = await frames();

  await run.click();
  await expect(page.getByTestId("worker-busy")).toBeVisible();

  await expect(page.getByTestId("worker-js-ms")).toHaveText(MS, { timeout: 60_000 });
  await expect(page.getByTestId("worker-wasm-ms")).toHaveText(MS, { timeout: 60_000 });

  await expect(page.getByTestId("worker-js-value")).toHaveText(digits(102334155));
  await expect(page.getByTestId("worker-wasm-value")).toHaveText(digits(102334155));

  // The whole point of the worker hook: frames kept painting throughout a
  // run that takes well over a second of solid compute.
  expect((await frames()) - before).toBeGreaterThan(5);
});

test("Cancel terminates a running call and both workers come back", async ({ page }) => {
  await page.goto("/");

  const run = page.getByTestId("worker-run");
  await expect(run).toBeEnabled({ timeout: 15_000 });

  await page.getByTestId("worker-n").fill("45");
  await run.click();

  const cancel = page.getByTestId("worker-cancel");
  await expect(cancel).toBeVisible();
  await cancel.click();

  await expect(page.getByTestId("worker-note")).toContainText("cancelled");
  await expect(page.getByTestId("worker-note")).toContainText("terminated");

  // Fresh workers were started, so the panel is usable again.
  await expect(run).toBeEnabled({ timeout: 15_000 });
  await page.getByTestId("worker-n").fill("20");
  await run.click();
  await expect(page.getByTestId("worker-wasm-value")).toHaveText(digits(6765), {
    timeout: 30_000,
  });
});

test("imports reach the module on both threads", async ({ page }) => {
  const consoleLines: string[] = [];
  page.on("console", (msg) => consoleLines.push(msg.text()));

  await page.goto("/");

  // Main thread: a plain function in the `imports` object.
  const mainRun = page.getByTestId("imports-main-run");
  await expect(mainRun).toBeEnabled({ timeout: 15_000 });
  await mainRun.click();
  await expect(page.getByTestId("imports-main-log")).toContainText("[42]");

  // Worker: the same import loaded by URL, because functions cannot cross
  // a worker boundary.
  const workerRun = page.getByTestId("imports-worker-run");
  await expect(workerRun).toBeEnabled({ timeout: 15_000 });
  await workerRun.click();
  await expect(page.getByTestId("imports-worker-result")).toContainText("3");

  await expect
    .poll(() => consoleLines.some((l) => l.includes("[worker] wasm logged: 3")))
    .toBe(true);
});

/* ------------------------------------------------------------------ */
/* Examples tab: passing more than numbers                             */
/* ------------------------------------------------------------------ */

test("tabs switch between the two pages", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByTestId("main-run")).toBeVisible({ timeout: 15_000 });

  await page.getByTestId("tab-examples").click();
  await expect(page.getByTestId("arrays-run")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("main-run")).toBeHidden();

  await page.getByTestId("tab-benchmarks").click();
  await expect(page.getByTestId("main-run")).toBeVisible();
});

test("arrays cross the boundary as (offset, length)", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("tab-examples").click();

  const run = page.getByTestId("arrays-run");
  await expect(run).toBeVisible({ timeout: 15_000 });
  await page.getByTestId("arrays-input").fill("5, 3, 9, 1, 7");
  await run.click();

  await expect(page.getByTestId("arrays-sum")).toHaveText("25");
  // Sorted in place by wasm, read back out of the same bytes by JS.
  await expect(page.getByTestId("arrays-sorted")).toHaveText("[1, 3, 5, 7, 9]");
  await expect(page.getByTestId("arrays-offset")).toContainText("0x");
});

test("strings round-trip, and a new one comes back as a packed bigint", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("tab-examples").click();

  const run = page.getByTestId("strings-run");
  await expect(run).toBeVisible({ timeout: 15_000 });
  await page.getByTestId("strings-input").fill("hello wasm");
  await run.click();

  await expect(page.getByTestId("strings-upper")).toHaveText("HELLO WASM");
  // Reverse runs on the bytes upperInPlace already changed.
  await expect(page.getByTestId("strings-reversed")).toHaveText("MSAW OLLEH");
  await expect(page.getByTestId("strings-packed")).toContainText("n");
  await expect(page.getByTestId("strings-packed")).toContainText("length 10");
});

test("objects work both by struct layout and by JSON", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("tab-examples").click();

  await expect(page.getByTestId("objects-struct-run")).toBeVisible({ timeout: 15_000 });

  // Four corners of a square, averaged through an out-pointer.
  await page.getByTestId("objects-points").fill("0,0  10,0  10,10  0,10");
  await page.getByTestId("objects-struct-run").click();
  await expect(page.getByTestId("objects-centroid")).toHaveText("(5, 5)");

  await page.getByTestId("objects-json-run").click();
  await expect(page.getByTestId("objects-stats")).toContainText('"count":3');
  await expect(page.getByTestId("objects-stats")).toContainText('"oldest":"Grace"');
});

test("bad JSON surfaces the module's 0n failure signal", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("tab-examples").click();

  await expect(page.getByTestId("objects-json-run")).toBeVisible({ timeout: 15_000 });
  await page.getByTestId("objects-json").fill("definitely not json");
  await page.getByTestId("objects-json-run").click();

  await expect(page.getByTestId("objects-stats")).toContainText("0n");
});
