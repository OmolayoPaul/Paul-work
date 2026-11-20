export class ApiError extends Error {
  constructor(message, { status = 0, code = "error" } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function request(path, { method = "GET", body, silent = false } = {}) {
  let response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      credentials: "include",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError("Could not reach the server. Check your connection and try again.", {
      code: "network",
    });
  }

  const text = await response.text();
  const data = text ? parseJson(text) : null;

  if (!response.ok) {
    const detail = data?.detail;
    const message =
      typeof detail === "string"
        ? detail
        : detail?.message || "Something went wrong. Please try again.";
    const code = typeof detail === "object" && detail ? detail.code : undefined;

    if (response.status === 401 && !silent) {
      window.dispatchEvent(
        new CustomEvent("afridetect:unauthorized", {
          detail: { code: code || "unauthenticated", message },
        }),
      );
    }
    throw new ApiError(message, { status: response.status, code });
  }

  return data;
}

export const api = {
  get: (path, options) => request(path, options),
  post: (path, body, options) => request(path, { ...options, method: "POST", body }),
  patch: (path, body, options) => request(path, { ...options, method: "PATCH", body }),
  delete: (path, options) => request(path, { ...options, method: "DELETE" }),
};

/** Fetch a file (CSV export) with the session cookie and save it locally. */
export async function downloadFile(path, fallbackName = "download.csv") {
  let response;
  try {
    response = await fetch(`/api${path}`, { credentials: "include" });
  } catch {
    throw new ApiError("Could not reach the server. Check your connection and try again.", {
      code: "network",
    });
  }
  if (!response.ok) {
    throw new ApiError("The download could not be prepared. Please try again.", {
      status: response.status,
      code: "download_failed",
    });
  }

  const disposition = response.headers.get("content-disposition") || "";
  const match = /filename="?([^";]+)"?/i.exec(disposition);
  const filename = match ? match[1] : fallbackName;
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
  return filename;
}
