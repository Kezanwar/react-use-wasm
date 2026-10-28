import { expect, test } from "@playwright/test";

const MS = /\d+(\.\d+)?\s*ms/;
/** toLocaleString inserts group separators, so match the digits loosely. */
const digits = (n: number) => new RegExp(String(n).split("").join("[,.\\s]?"));

test("serves both .wasm files as application/wasm, so compileStreaming is used", async ({
  request,
}) => {
  for (const file of ["/math.wasm", "/memory.wasm"]) {
    const res = await request.get(file);
    expect(res.status(), file).toBe(200);
    expect(res.headers()["content-type"], file).toBe("application/wasm");
  }
});

test("the two tabs load two different modules", async ({ page }) => {
  const fetched: string[] = [];
  page.on("request", (r) => {
    const path = new URL(r.url()).pathname;
    if (path.endsWith(".wasm")) fetched.push(path);
  });

  await page.goto("/");
  await expect(page.getByTestId("main-run")).toBeVisible({ timeout: 15_000 });
  expect(fetched).toContain("/math.wasm");
  // The benchmark must not pull in the 186 kB module: that is the whole
  // point of the split.
  expect(fetched).not.toContain("/memory.wasm");

  await page.getByTestId("tab-examples").click();
  await expect(page.getByTestId("arrays-run")).toBeVisible({ timeout: 15_000 });
  expect(fetched).toContain("/memory.wasm");
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

test("the frame counter belongs to Benchmarks and pins itself when scrolled past", async ({
  page,
}) => {
  await page.setViewportSize({ width: 900, height: 820 });
  await page.goto("/");

  const inline = page.getByTestId("frames");
  const floating = page.getByTestId("frames-floating");

  await expect(inline).toBeVisible({ timeout: 15_000 });
  await expect(floating).toHaveCount(0);

  // Scroll the inline pill off screen: a copy pins to the bottom right.
  await page.mouse.wheel(0, 700);
  await expect(floating).toBeVisible();

  await page.mouse.wheel(0, -900);
  await expect(floating).toHaveCount(0);

  // It means nothing on the Examples tab, so it is not there at all.
  await page.getByTestId("tab-examples").click();
  await expect(page.getByTestId("arrays-run")).toBeVisible({ timeout: 15_000 });
  await expect(inline).toHaveCount(0);
  await expect(floating).toHaveCount(0);
});

test("tabs switch between the three pages", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByTestId("main-run")).toBeVisible({ timeout: 15_000 });

  await page.getByTestId("tab-examples").click();
  await expect(page.getByTestId("arrays-run")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("main-run")).toBeHidden();

  await page.getByTestId("tab-api").click();
  await expect(page.getByText("WasmAllocator").first()).toBeVisible();
  await expect(page.getByTestId("arrays-run")).toBeHidden();

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

test("the Examples worker card runs fib off the main thread", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("tab-examples").click();

  const run = page.getByTestId("worker-limits-run");
  // The worker has to start and instantiate before the button enables.
  await expect(run).toBeEnabled({ timeout: 20_000 });

  await page.getByTestId("worker-limits-n").fill("30");
  await run.click();

  await expect(page.getByTestId("worker-limits-value")).toHaveText(digits(832040), {
    timeout: 30_000,
  });
  await expect(page.getByTestId("worker-limits-ms")).toHaveText(MS);
});

test("the n input can be emptied, and Run waits until it is not", async ({ page }) => {
  await page.goto("/");

  const n = page.getByTestId("main-n");
  const run = page.getByTestId("main-run");
  await expect(run).toBeEnabled({ timeout: 15_000 });

  // A plain type="number" coerces an empty field to 0 and runs fib(0).
  // Here it stays empty and the button waits.
  await n.fill("");
  await expect(n).toHaveValue("");
  await expect(run).toBeDisabled();

  // The steppers bring it back, starting from min.
  const plus = page.getByRole("button", { name: "Increase n for the main-thread benchmark" });
  await plus.click();
  await expect(n).toHaveValue("0");
  await expect(run).toBeEnabled();

  await plus.click();
  await expect(n).toHaveValue("1");

  // Clamped at the panel's maximum, with the stepper disabled there.
  await n.fill("42");
  await expect(plus).toBeDisabled();
  await n.fill("99");
  await n.blur();
  await expect(n).toHaveValue("42");
});

test("each memory example can be flipped between withScope and by hand", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("tab-examples").click();
  await expect(page.getByTestId("arrays-run")).toBeVisible({ timeout: 15_000 });

  const block = page.getByTestId("arrays-code-tabs");
  const scoped = block.getByRole("tab", { name: "withScope" });
  const byHand = block.getByRole("tab", { name: "by hand" });

  // withScope is what the page argues for, so it is what you land on.
  await expect(scoped).toHaveAttribute("aria-selected", "true");
  await expect(block).toContainText("s.i32ArrayArg");
  await expect(block).not.toContainText("exports.free");

  await byHand.click();
  await expect(byHand).toHaveAttribute("aria-selected", "true");
  // The whole point of the comparison: the manual version has to free.
  await expect(block).toContainText("exports.free(ptr)");
  await expect(block).toContainText("xs.byteLength");
  await expect(block).not.toContainText("s.i32ArrayArg");

  // All four memory examples get the pair.
  for (const id of ["strings-code-tabs", "struct-code-tabs", "json-code-tabs"]) {
    await expect(page.getByTestId(id).getByRole("tab", { name: "by hand" })).toBeVisible();
  }
});

test("the Examples page leads with a module that needs no memory", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("tab-examples").click();

  // Computed during render: there is no button to press.
  await expect(page.getByTestId("numbers-add")).toHaveText("5", { timeout: 15_000 });
  await expect(page.getByTestId("numbers-scale")).toHaveText("6");

  await page.getByTestId("numbers-a").fill("7");
  await expect(page.getByTestId("numbers-add")).toHaveText("10");
  await expect(page.getByTestId("numbers-scale")).toHaveText("21");

  // It comes before the memory examples, which is the whole point.
  const order = await page.evaluate(() => {
    const numbers = document.querySelector('[data-testid="numbers-add"]')!;
    const arrays = document.querySelector('[data-testid="arrays-run"]')!;
    // Node.DOCUMENT_POSITION_FOLLOWING
    return (numbers.compareDocumentPosition(arrays) & 4) !== 0;
  });
  expect(order).toBe(true);
});
