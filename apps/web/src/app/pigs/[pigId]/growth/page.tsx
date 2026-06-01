"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { clearToken } from "@/lib/auth";

type Pig = {
  id: number;
  earTagNo: string;
  individualNo: string | null;
  sex: string;
  birthDate: string;
};

type Growth = {
  pigId: number;
  startDate: string | null;
  startAgeDays: number | null;
  startWeightKg: number | null;
  endDate: string | null;
  endAgeDays: number | null;
  endWeightKg: number | null;
  testDays: number | null;
  feedKg: number | null;
  adgG: number | null;
  adfiKg: number | null;
  fcr: number | null;
  dtswDays: number | null;
  endBackfatMm: number | null;
  endEmaCm2: number | null;
  remark: string | null;
};

const toNum = (s: string): number | null => {
  const t = s.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};

export default function GrowthPage() {
  const router = useRouter();
  const params = useParams<{ pigId: string }>();
  const pigId = Number(params.pigId);

  const [pig, setPig] = useState<Pig | null>(null);
  const [growth, setGrowth] = useState<Growth | null>(null);
  const [form, setForm] = useState({
    startDate: "",
    startWeightKg: "",
    endDate: "",
    endWeightKg: "",
    feedKg: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    return Promise.resolve()
      .then(() => apiFetch<Pig>(`/pigs/${pigId}`))
      .then((p) => {
        setPig(p);
        return apiFetch<Growth | null>(`/pigs/${pigId}/growth`);
      })
      .then((g) => {
        setGrowth(g);
        setForm({
          startDate: g?.startDate ?? "",
          startWeightKg: g?.startWeightKg == null ? "" : String(g.startWeightKg),
          endDate: g?.endDate ?? "",
          endWeightKg: g?.endWeightKg == null ? "" : String(g.endWeightKg),
          feedKg: g?.feedKg == null ? "" : String(g.feedKg),
        });
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
  }, [pigId, router]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const canSave = useMemo(() => {
    return form.startDate.trim() && form.endDate.trim() && toNum(form.startWeightKg) != null && toNum(form.endWeightKg) != null;
  }, [form]);

  const onSave = async () => {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      const saved = await apiFetch<Growth>(`/pigs/${pigId}/growth`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startDate: form.startDate.trim() || null,
          startWeightKg: toNum(form.startWeightKg),
          endDate: form.endDate.trim() || null,
          endWeightKg: toNum(form.endWeightKg),
          feedKg: toNum(form.feedKg),
        }),
      });
      setGrowth(saved);
    } catch (err: unknown) {
      const e = err as { message?: string };
      setError(typeof e.message === "string" ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-1 flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <div className="text-xl font-semibold">生长性能</div>
        <Link className="text-blue-600 hover:underline" href={`/pigs/${pigId}`}>
          返回猪只
        </Link>
      </div>

      {pig ? (
        <div className="rounded-lg border bg-white p-4 text-sm">
          <span className="text-zinc-500">耳标号：</span>
          <span className="font-medium">{pig.earTagNo}</span>
          <span className="mx-3 text-zinc-300">|</span>
          <span className="text-zinc-500">个体号：</span>
          <span className="font-medium">{pig.individualNo ?? ""}</span>
          <span className="mx-3 text-zinc-300">|</span>
          <span className="text-zinc-500">出生日期：</span>
          <span className="font-medium">{pig.birthDate}</span>
        </div>
      ) : null}

      <div className="rounded-lg border bg-white p-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <label className="grid gap-2 text-sm">
            <span className="text-zinc-600">始测日期</span>
            <input className="h-10 rounded-md border px-3" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} placeholder="YYYY-MM-DD" />
          </label>
          <label className="grid gap-2 text-sm">
            <span className="text-zinc-600">始测体重(kg)</span>
            <input className="h-10 rounded-md border px-3" value={form.startWeightKg} onChange={(e) => setForm({ ...form, startWeightKg: e.target.value })} />
          </label>
          <label className="grid gap-2 text-sm">
            <span className="text-zinc-600">结测日期</span>
            <input className="h-10 rounded-md border px-3" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} placeholder="YYYY-MM-DD" />
          </label>
          <label className="grid gap-2 text-sm">
            <span className="text-zinc-600">结测体重(kg)</span>
            <input className="h-10 rounded-md border px-3" value={form.endWeightKg} onChange={(e) => setForm({ ...form, endWeightKg: e.target.value })} />
          </label>
          <label className="grid gap-2 text-sm">
            <span className="text-zinc-600">耗料(kg)</span>
            <input className="h-10 rounded-md border px-3" value={form.feedKg} onChange={(e) => setForm({ ...form, feedKg: e.target.value })} />
          </label>
        </div>

        {error ? <div className="mt-3 text-sm text-red-600">{error}</div> : null}

        <div className="mt-4 flex items-center gap-3">
          <button className="h-10 rounded-md bg-black px-4 text-white disabled:opacity-50" disabled={!canSave || saving} onClick={onSave}>
            {saving ? "保存中..." : "保存"}
          </button>
          <button className="h-10 rounded-md border px-4" onClick={reload}>
            刷新
          </button>
        </div>
      </div>

      <div className="rounded-lg border bg-white p-4">
        <div className="text-sm text-zinc-600">自动计算（保存后生成）</div>
        <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
          <div>
            <span className="text-zinc-500">始测日龄：</span>
            <span className="font-medium">{growth?.startAgeDays ?? ""}</span>
          </div>
          <div>
            <span className="text-zinc-500">结测日龄：</span>
            <span className="font-medium">{growth?.endAgeDays ?? ""}</span>
          </div>
          <div>
            <span className="text-zinc-500">测定天数：</span>
            <span className="font-medium">{growth?.testDays ?? ""}</span>
          </div>
          <div>
            <span className="text-zinc-500">DTSW(日龄)：</span>
            <span className="font-medium">{growth?.dtswDays ?? ""}</span>
          </div>
          <div>
            <span className="text-zinc-500">ADG(g/d)：</span>
            <span className="font-medium">{growth?.adgG == null ? "" : growth.adgG.toFixed(1)}</span>
          </div>
          <div>
            <span className="text-zinc-500">ADFI(kg/d)：</span>
            <span className="font-medium">{growth?.adfiKg == null ? "" : growth.adfiKg.toFixed(3)}</span>
          </div>
          <div>
            <span className="text-zinc-500">FCR：</span>
            <span className="font-medium">{growth?.fcr == null ? "" : growth.fcr.toFixed(3)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
