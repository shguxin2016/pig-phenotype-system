import { getToken } from "./auth";

export type ApiError = { status: number; message: string };

const baseUrl = () => process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001";

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;

export const apiFetch = async <T>(
  path: string,
  init?: RequestInit & { auth?: boolean }
): Promise<T> => {
  const url = `${baseUrl()}${path}`;
  const headers = new Headers(init?.headers);

  if (init?.auth !== false) {
    const token = getToken();
    if (token) headers.set("Authorization", `Bearer ${token}`);
  }

  const res = await fetch(url, {
    ...init,
    headers,
  });

  const contentType = res.headers.get("content-type") ?? "";
  const data = contentType.includes("application/json") ? await res.json() : await res.text();

  if (!res.ok) {
    const message = (() => {
      if (typeof data === "string") return data;
      if (isRecord(data) && typeof data.message === "string") return data.message;
      return "请求失败";
    })();
    throw { status: res.status, message } satisfies ApiError;
  }

  return data as T;
};
