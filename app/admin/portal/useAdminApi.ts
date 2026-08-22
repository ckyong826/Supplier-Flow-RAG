"use client";

import { useCallback, useState } from "react";

export function useAdminApi(initialToken: string) {
  const [accessToken, setAccessToken] = useState(initialToken);

  const refreshSession = useCallback(async () => {
    const refreshToken = sessionStorage.getItem("supplierflow-admin-refresh");
    if (!refreshToken) return "";
    try {
      const response = await fetch("/api/admin/session", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken }),
      });
      if (!response.ok) return "";
      const data = await response.json();
      sessionStorage.setItem("supplierflow-admin-token", data.accessToken);
      if (data.refreshToken) sessionStorage.setItem("supplierflow-admin-refresh", data.refreshToken);
      setAccessToken(data.accessToken);
      return data.accessToken as string;
    } catch {
      return "";
    }
  }, []);

  const authedFetch = useCallback(async (url: string, init: RequestInit = {}, bearer = accessToken): Promise<Response> => {
    const requestHeaders = (currentBearer: string) => {
      const next = new Headers(init.headers);
      next.set("Authorization", `Bearer ${currentBearer}`);
      if (init.body instanceof FormData) next.delete("Content-Type");
      else next.set("Content-Type", "application/json");
      return next;
    };
    const response = await fetch(url, { ...init, headers: requestHeaders(bearer) });
    if (response.status !== 401) return response;
    const renewed = await refreshSession();
    if (!renewed) return response;
    return fetch(url, { ...init, headers: requestHeaders(renewed) });
  }, [accessToken, refreshSession]);

  const readSection = useCallback(async (url: string, label: string, bearer: string) => {
    const response = await authedFetch(url, {}, bearer);
    if (response.ok) return { label, ok: true as const, data: await response.json() };
    const body = await response.json().catch(() => ({}));
    const reason = body.detail || body.error || `HTTP ${response.status}`;
    console.error(`[admin] ${label} failed:`, reason);
    return { label, ok: false as const, status: response.status, reason: String(body.error || reason) };
  }, [authedFetch]);

  return { accessToken, setAccessToken, authedFetch, readSection };
}
