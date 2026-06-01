"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { setToken } from "@/lib/auth";

type Unit = { id: number; name: string; type: string };

export default function LoginPage() {
  const router = useRouter();
  const [units, setUnits] = useState<Unit[]>([]);
  const [unitName, setUnitName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    apiFetch<Unit[]>("/meta/units", { auth: false })
      .then((data) => {
        setUnits(data);
        if (data.length > 0) setUnitName(data[data.length - 1]?.name ?? "");
      })
      .catch(() => {
        setError("无法加载单位列表");
      });
  }, []);

  const canSubmit = useMemo(() => {
    return username.trim().length > 0 && unitName.trim().length > 0 && password.length > 0;
  }, [username, unitName, password]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{ accessToken: string }>("/auth/login", {
        method: "POST",
        auth: false,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, unitName, password }),
      });
      setToken(res.accessToken);
      router.replace("/pigs");
    } catch (err: unknown) {
      const e = err as { message?: string };
      setError(typeof e.message === "string" ? e.message : "登录失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-1 items-center justify-center p-6 bg-zinc-50">
      <form onSubmit={onSubmit} className="w-full max-w-md rounded-xl bg-white p-6 shadow">
        <div className="text-xl font-semibold">登录</div>
        <div className="mt-6 grid gap-4">
          <label className="grid gap-2 text-sm">
            <span className="text-zinc-600">单位</span>
            <select
              value={unitName}
              onChange={(e) => setUnitName(e.target.value)}
              className="h-10 rounded-md border px-3"
            >
              {units.map((u) => (
                <option key={u.id} value={u.name}>
                  {u.name}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-2 text-sm">
            <span className="text-zinc-600">用户名</span>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="h-10 rounded-md border px-3"
              placeholder="请输入用户名"
              autoComplete="username"
            />
          </label>
          <label className="grid gap-2 text-sm">
            <span className="text-zinc-600">密码</span>
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              className="h-10 rounded-md border px-3"
              placeholder="请输入密码"
              autoComplete="current-password"
            />
          </label>
          {error ? <div className="text-sm text-red-600">{error}</div> : null}
          <button
            type="submit"
            disabled={!canSubmit || loading}
            className="h-10 rounded-md bg-black text-white disabled:opacity-50"
          >
            {loading ? "登录中..." : "登录"}
          </button>
        </div>
      </form>
    </div>
  );
}
