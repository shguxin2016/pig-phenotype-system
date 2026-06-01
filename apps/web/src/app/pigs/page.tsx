"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { clearToken, getToken } from "@/lib/auth";

type Pig = {
  id: number;
  unitId: number;
  breedId: number;
  individualNo: string | null;
  earTagNo: string;
  sex: string;
  birthDate: string;
  damEarTagNo: string | null;
};

export default function PigsPage() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<Pig[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = getToken();
    if (!token) router.replace("/login");
  }, [router]);

  const reload = useCallback(() => {
    return Promise.resolve()
      .then(() => apiFetch<{ total: number; rows: Pig[] }>(`/pigs?q=${encodeURIComponent(q)}`))
      .then((res) => {
        setRows(res.rows);
        setError(null);
      })
      .catch((err: unknown) => {
        const e = err as { status?: number; message?: string };
        if (e.status === 401) {
          clearToken();
          router.replace("/login");
          return;
        }
        setError(typeof e.message === "string" ? e.message : "加载失败");
      });
  }, [q, router]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const filteredHint = useMemo(() => (q.trim().length > 0 ? `（已按“${q.trim()}”筛选）` : ""), [q]);

  return (
    <div className="flex flex-1 flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <div className="text-xl font-semibold">测定猪只档案 {filteredHint}</div>
        <div className="flex items-center gap-3">
          <Link className="text-blue-600 hover:underline" href="/base-info">
            基本信息(年度)
          </Link>
          <button
            className="h-9 rounded-md border px-3"
            onClick={() => {
              clearToken();
              router.replace("/login");
            }}
          >
            退出登录
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <input
          className="h-10 w-full max-w-md rounded-md border px-3"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="搜索：耳标号/个体号/母猪耳号"
        />
        <button className="h-10 rounded-md bg-black px-4 text-white" onClick={reload}>
          查询
        </button>
      </div>

      {error ? <div className="text-sm text-red-600">{error}</div> : null}

      <div className="overflow-hidden rounded-lg border bg-white">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 text-left text-zinc-600">
            <tr>
              <th className="px-3 py-2">耳标号</th>
              <th className="px-3 py-2">个体号</th>
              <th className="px-3 py-2">性别</th>
              <th className="px-3 py-2">出生日期</th>
              <th className="px-3 py-2">母猪耳号</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id} className="border-t">
                <td className="px-3 py-2 font-medium">{p.earTagNo}</td>
                <td className="px-3 py-2">{p.individualNo ?? ""}</td>
                <td className="px-3 py-2">{p.sex}</td>
                <td className="px-3 py-2">{p.birthDate}</td>
                <td className="px-3 py-2">{p.damEarTagNo ?? ""}</td>
                <td className="px-3 py-2 text-right">
                  <Link className="text-blue-600 hover:underline" href={`/pigs/${p.id}`}>
                    详情
                  </Link>
                </td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td className="px-3 py-10 text-center text-zinc-500" colSpan={6}>
                  暂无数据
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
