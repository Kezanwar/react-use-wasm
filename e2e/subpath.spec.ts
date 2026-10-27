import { expect, test } from "@playwright/test";

/*
 * The demo is deployed to GitHub Pages, which serves it from /<repo>/ rather
 * than /. An absolute asset path like "/math.wasm" works in dev and 404s in
 * production, so it is exactly the kind of break that reaches users. These
 * run against scripts/serve-subpath.mjs, which mimics Pages.
 *
 * The second case serves .wasm as the wrong MIME type, proving the hooks
 * fall back from compileStreaming to compile(arrayBuffer) rather than dying,
 * in case Pages ever gets the header wrong.
 */

for (const [label, base] of [
  ["correct application/wasm", "http://localhost:4178/react-use-wasm/"],
  ["wrong MIME (compile fallback)", "http://localhost:4178/badmime/"],
] as const) {
  test(`subpath deploy: ${label}`, async ({ page }) => {
    test.setTimeout(120_000);
    const fetched: string[] = [];
    const failures: string[] = [];
    page.on("request", (r) => {
      const p = new URL(r.url()).pathname;
      if (p.endsWith(".wasm") || p.endsWith(".js")) fetched.push(p);
    });
    page.on("response", (r) => {
      if (r.status() >= 400) failures.push(`${r.status()} ${new URL(r.url()).pathname}`);
    });
    page.on("pageerror", (e) => failures.push("pageerror: " + e.message));

    await page.goto(base);

    // Benchmarks tab
    await expect(page.getByTestId("main-run")).toBeEnabled({ timeout: 20_000 });
    await expect(page.getByTestId("add-result")).toHaveText("5");
    await page.getByTestId("main-n").fill("28");
    await page.getByTestId("main-run").click();
    await expect(page.getByTestId("main-verdict")).toContainText("faster", { timeout: 30_000 });

    // Worker + importsUrl, the two things most likely to break on a subpath
    await page.getByTestId("worker-n").fill("30");
    await expect(page.getByTestId("worker-run")).toBeEnabled({ timeout: 20_000 });
    await page.getByTestId("worker-run").click();
    await expect(page.getByTestId("worker-wasm-value")).toHaveText(/8[,.\s]?3[,.\s]?2[,.\s]?0[,.\s]?4[,.\s]?0/, { timeout: 30_000 });

    await page.getByTestId("imports-worker-run").click();
    await expect(page.getByTestId("imports-worker-result")).toContainText("3");

    // Examples tab, the second module
    await page.getByTestId("tab-examples").click();
    await expect(page.getByTestId("arrays-run")).toBeVisible({ timeout: 20_000 });
    await page.getByTestId("arrays-run").click();
    await expect(page.getByTestId("arrays-sum")).toHaveText("25");
    await page.getByTestId("objects-json-run").click();
    await expect(page.getByTestId("objects-stats")).toContainText('"count":3');

    console.log(`\n[${label}] fetched: ${[...new Set(fetched)].join(", ")}`);
    console.log(`[${label}] failures: ${failures.length ? failures.join(" | ") : "none"}`);
    expect(failures).toEqual([]);
  });
}
