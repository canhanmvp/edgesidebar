/* Link checking shared by the cleanup dialog and the weekly worker job.
   Requests go straight to each pinned site, without cookies. */
(function (root) {
  "use strict";
  const C =
    root.Pinned || (typeof require === "function" && require("./core.js"));
  const TIMEOUT = 10000;
  async function probe(url, signal, fetchImpl = root.fetch) {
    const options = {
      credentials: "omit",
      cache: "no-store",
      referrerPolicy: "no-referrer",
      redirect: "follow",
      signal: AbortSignal.any([signal, AbortSignal.timeout(TIMEOUT)]),
    };
    let response = await fetchImpl(url, { ...options, method: "HEAD" });
    // Many servers mishandle HEAD; confirm any error with a real GET.
    if (response.status >= 400) {
      response = await fetchImpl(url, { ...options, method: "GET" });
      response.body?.cancel().catch(() => {});
    }
    return {
      status: response.status,
      redirected: response.redirected,
      finalUrl: response.url,
    };
  }
  // Checks pins a few at a time; onResult(pin, result) runs as each finishes.
  async function run(
    pins,
    { signal, concurrency = 4, onResult = () => {}, fetchImpl } = {},
  ) {
    const queue = [...pins];
    const results = {};
    async function worker() {
      while (queue.length && !signal.aborted) {
        const pin = queue.shift();
        let outcome;
        try {
          outcome = await probe(pin.url, signal, fetchImpl);
        } catch (error) {
          if (signal.aborted) return;
          outcome = { error: error.name || "error" };
        }
        results[pin.id] = {
          ...C.classifyCheck(pin.url, outcome),
          checkedAt: Date.now(),
        };
        onResult(pin, results[pin.id]);
      }
    }
    await Promise.all(Array.from({ length: concurrency }, worker));
    return results;
  }
  const api = { probe, run, TIMEOUT };
  root.PinnedLinkCheck = api;
  if (typeof module !== "undefined") module.exports = api;
})(globalThis);
