export async function api(url, { method = "GET", token, body, form, headers = {} } = {}) {
  const h = { ...headers };
  if (token) h.Authorization = `Bearer ${token}`;
  let payload;
  if (form) {
    payload = new URLSearchParams(form);
  } else if (body !== undefined) {
    h["Content-Type"] = "application/json; charset=UTF-8";
    payload = JSON.stringify(body);
  }
  const res = await fetch(url, { method, headers: h, body: payload });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  if (!res.ok || (data.error && data.error.code !== "ok" && (data.error.message || typeof data.error === "string"))) {
    const msg = data.error?.message || data.description || data.raw || res.statusText;
    throw new Error(`${res.status} ${msg}`);
  }
  return data;
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
