/**
 * HTTP-слой терминала: GET/POST к backend с таймаутом, X-Request-Id и повтором при сетевой ошибке.
 * Подключается в index.html перед app.js; использует window.PATH_API_BASE_URL при необходимости.
 */
const API_BASE_URL = window.PATH_API_BASE_URL || "";

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const DEFAULT_FETCH_TIMEOUT_MS = 55000;

function generateRequestId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `req-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
}

function shouldRetryFetchError(err) {
  if (!err) return false;
  if (err.name === "TypeError") return true;
  if (err.name === "AbortError") return true;
  if (String(err.message || "").includes("Failed to fetch")) return true;
  return false;
}

function mergeAbortSignals(a, b) {
  if (!b) return a;
  if (!a) return b;
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  if (a.aborted || b.aborted) {
    onAbort();
    return controller.signal;
  }
  a.addEventListener("abort", onAbort, { once: true });
  b.addEventListener("abort", onAbort, { once: true });
  return controller.signal;
}

/**
 * GET/POST к API с таймаутом и одним повтором при сетевой ошибке.
 * @param {string} path путь начиная с /api/...
 * @param {{ method?: string, body?: object, timeoutMs?: number, retries?: number, signal?: AbortSignal }} opts
 */
async function fetchApi(path, opts = {}) {
  const method = opts.method || "GET";
  const body = opts.body;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_FETCH_TIMEOUT_MS;
  const retries = opts.retries ?? 1;
  const outerSignal = opts.signal;
  const url = `${API_BASE_URL}${path}`;
  let lastErr;
  try {
    /** Пауза idle-таймера киоска на время ожидания ответа (см. app.js). */
    try {
      if (typeof window.pathTerminalIdleFetchBegin === "function") window.pathTerminalIdleFetchBegin();
    } catch {
      /* ignore */
    }

    for (let attempt = 0; attempt <= retries; attempt += 1) {
      if (outerSignal?.aborted) {
        const e = new Error("Aborted");
        e.name = "AbortError";
        throw e;
      }
      const rid = generateRequestId();
      const timeoutController = new AbortController();
      const timer = setTimeout(() => timeoutController.abort(), timeoutMs);
      const combined = mergeAbortSignals(timeoutController.signal, outerSignal || null);
      try {
        const headers = {
          Accept: "application/json",
          "X-Request-Id": rid,
        };
        if (body !== undefined) {
          headers["Content-Type"] = "application/json";
        }
        const response = await fetch(url, {
          method,
          headers,
          body: body === undefined ? undefined : JSON.stringify(body),
          signal: combined,
        });
        clearTimeout(timer);
        if (!response.ok) {
          throw new Error(`API error ${response.status}`);
        }
        const ct = response.headers.get("content-type") || "";
        if (ct.includes("application/json")) {
          return response.json();
        }
        return null;
      } catch (err) {
        clearTimeout(timer);
        lastErr = err;
        if (outerSignal?.aborted) throw err;
        const canRetry = attempt < retries && shouldRetryFetchError(err);
        if (!canRetry) throw err;
        await wait(450 * (attempt + 1));
      }
    }
    throw lastErr || new Error("fetchApi failed");
  } finally {
    try {
      if (typeof window.pathTerminalIdleFetchEnd === "function") window.pathTerminalIdleFetchEnd();
    } catch {
      /* ignore */
    }
  }
}

async function postJson(path, payload, options = {}) {
  return fetchApi(path, {
    method: "POST",
    body: payload,
    timeoutMs: options.timeoutMs,
    retries: options.retries,
    signal: options.signal,
  });
}

async function getJson(path, options = {}) {
  return fetchApi(path, {
    method: "GET",
    timeoutMs: options.timeoutMs,
    retries: options.retries,
    signal: options.signal,
  });
}
