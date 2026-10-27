import { expect, test } from "@playwright/test";

test("serves .wasm as application/wasm, so compileStreaming is used", async ({ request }) => {
  const res = await request.get("/math.wasm");
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toBe("application/wasm");
});

test("useWasm computes synchronously during render", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByTestId("add-result")).toContainText("5");
  await expect(page.getByTestId("scale-result")).toContainText("10");
  await expect(page.getByTestId("main-fib-result")).toContainText("75025"); // fib(25)
});

test("useWasmWorker runs fib(40) without blocking the main thread", async ({ page }) => {
  await page.goto("/");

  const run = page.getByTestId("worker-run");
  await expect(run).toBeEnabled({ timeout: 15_000 });

  await page.getByTestId("worker-n").fill("40");

  const framesBefore = Number(
    (await page.getByTestId("frames").innerText()).replace(/\D/g, "")
  );

  await run.click();
  await expect(page.getByTestId("worker-busy")).toBeVisible();

  await expect(page.getByTestId("worker-result")).toContainText("102334155", {
    timeout: 30_000,
  });

  const framesAfter = Number(
    (await page.getByTestId("frames").innerText()).replace(/\D/g, "")
  );

  // The whole point of the worker hook: frames kept painting throughout a
  // call that takes roughly half a second of solid compute.
  expect(framesAfter - framesBefore).toBeGreaterThan(5);
});

test("Cancel terminates a running call and the worker comes back", async ({ page }) => {
  await page.goto("/");

  const run = page.getByTestId("worker-run");
  await expect(run).toBeEnabled({ timeout: 15_000 });

  await page.getByTestId("worker-fn").selectOption("countPrimes");
  await page.getByTestId("worker-n").fill("200000000");
  await run.click();

  const cancel = page.getByTestId("worker-cancel");
  await expect(cancel).toBeVisible();
  await cancel.click();

  await expect(page.getByTestId("worker-result")).toContainText("cancelled");
  await expect(page.getByTestId("worker-result")).toContainText("worker terminated");

  // reload() spun up a fresh worker, so the panel is usable again.
  await expect(run).toBeEnabled({ timeout: 15_000 });
  await page.getByTestId("worker-fn").selectOption("fib");
  await page.getByTestId("worker-n").fill("20");
  await run.click();
  await expect(page.getByTestId("worker-result")).toContainText("6765");
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
