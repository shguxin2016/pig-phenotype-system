"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { clearToken } from "@/lib/auth";

type Pig = {
  id: number;
  earTagNo: string;
  individualNo: string | null;
  birthDate: string;
  sex: string;
};

type MeatqRecord = {
  pigId: number;
  sex: string | null;
  colorScore: number | null;
  colorL: number | null;
  colorA: number | null;
  colorB: number | null;
  ph1h: number | null;
  ph24h: number | null;
  dripLossPct: number | null;
  waterHoldingPct: number | null;
  marblingScore: number | null;
  imfPct: number | null;
  impPct: number | null;
  moisturePct: number | null;
  tendernessShearN: number | null;
  cookedMeatRate: number | null;
  remark: string | null;
};

type MeatqResp = { record: MeatqRecord; warnings: string[] } | null;

const toNum = (s: string): number | null => {
  const t = s.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};

const inputCls = "h-10 rounded-md border px-3";
const labelCls = "grid gap-2 text-sm";
const labelTextCls = "text-zinc-600";

export default function MeatqPage() {
  const router = useRouter();
  const params = useParams<{ pigId: string }>();
  const pigId = Number(params.pigId);

  const [pig, setPig] = useState<Pig | null>(null);
  const [resp, setResp] = useState<MeatqResp>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    sex: "",
    colorScore: "",
    colorL: "",
    colorA: "",
    colorB: "",
    ph1h: "",
    ph24h: "",
    waterHoldingPct: "",
    dripLossPct: "",
    marblingScore: "",
    imfPct: "",
    impPct: "",
    moisturePct: "",
    tendernessShearN: "",
    cookedMeatRate: "",
    remark: "",
  });

  const handle401 = useCallback(() => {
    clearToken();
    router.replace("/login");
  }, [router]);

  const reload = useCallback(() => {
    return Promise.resolve()
      .then(() => apiFetch<Pig>(`/pigs/${pigId}`))
      .then((p) => {
        setPig(p);
        return apiFetch<MeatqResp>(`/pigs/${pigId}/meatq`).then((r) => ({ p, r }));
      })
      .then(({ p, r }) => {
        setResp(r);
        setWarnings(r?.warnings ?? []);

        const rec = r?.record;
        setForm({
          sex: rec?.sex ?? p.sex ?? "",
          colorScore: rec?.colorScore == null ? "" : String(rec.colorScore),
          colorL: rec?.colorL == null ? "" : String(rec.colorL),
          colorA: rec?.colorA == null ? "" : String(rec.colorA),
          colorB: rec?.colorB == null ? "" : String(rec.colorB),
          ph1h: rec?.ph1h == null ? "" : String(rec.ph1h),
          ph24h: rec?.ph24h == null ? "" : String(rec.ph24h),
          waterHoldingPct: rec?.waterHoldingPct == null ? "" : String(rec.waterHoldingPct),
          dripLossPct: rec?.dripLossPct == null ? "" : String(rec.dripLossPct),
          marblingScore: rec?.marblingScore == null ? "" : String(rec.marblingScore),
          imfPct: rec?.imfPct == null ? "" : String(rec.imfPct),
          impPct: rec?.impPct == null ? "" : String(rec.impPct),
          moisturePct: rec?.moisturePct == null ? "" : String(rec.moisturePct),
          tendernessShearN: rec?.tendernessShearN == null ? "" : String(rec.tendernessShearN),
          cookedMeatRate: rec?.cookedMeatRate == null ? "" : String(rec.cookedMeatRate),
          remark: rec?.remark ?? "",
        });
        setError(null);
      })
      .catch((err: unknown) => {
        const e = err as { status?: number; message?: string };
        if (e.status === 401) {
          handle401();
          return;
        }
        setError(typeof e.message === "string" ? e.message : "加载失败");
      });
  }, [handle401, pigId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const onSave = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      const r = await apiFetch<NonNullable<MeatqResp>>(`/pigs/${pigId}/meatq`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sex: form.sex.trim() || null,
          colorScore: toNum(form.colorScore),
          colorL: toNum(form.colorL),
          colorA: toNum(form.colorA),
          colorB: toNum(form.colorB),
          ph1h: toNum(form.ph1h),
          ph24h: toNum(form.ph24h),
          waterHoldingPct: toNum(form.waterHoldingPct),
          dripLossPct: toNum(form.dripLossPct),
          marblingScore: toNum(form.marblingScore),
          imfPct: toNum(form.imfPct),
          impPct: toNum(form.impPct),
          moisturePct: toNum(form.moisturePct),
          tendernessShearN: toNum(form.tendernessShearN),
          cookedMeatRate: toNum(form.cookedMeatRate),
          remark: form.remark.trim() || null,
        }),
      });
      setResp(r);
      setWarnings(r.warnings ?? []);
    } catch (err: unknown) {
      const e = err as { status?: number; message?: string };
      if (e.status === 401) {
        handle401();
        return;
      }
      setError(typeof e.message === "string" ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }, [form, handle401, pigId]);

  return (
    <div className="flex flex-1 flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <div className="text-xl font-semibold">猪肉品质（NY/T 821）</div>
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

      {warnings.length > 0 ? (
        <div className="rounded-lg border bg-amber-50 p-4 text-sm text-amber-900">{warnings.join("；")}</div>
      ) : null}
      {error ? <div className="text-sm text-red-600">{error}</div> : null}

      <div className="rounded-lg border bg-white p-4">
        <div className="text-sm font-medium">肉色</div>
        <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2">
          <label className={labelCls}>
            <span className={labelTextCls}>性别</span>
            <input className={inputCls} value={form.sex} onChange={(e) => setForm({ ...form, sex: e.target.value })} placeholder="如：公/母/阉公" />
          </label>
          <label className={labelCls}>
            <span className={labelTextCls}>肉色评分（1~6，0.5分档）</span>
            <input className={inputCls} value={form.colorScore} onChange={(e) => setForm({ ...form, colorScore: e.target.value })} />
          </label>
          <label className={labelCls}>
            <span className={labelTextCls}>L*</span>
            <input className={inputCls} value={form.colorL} onChange={(e) => setForm({ ...form, colorL: e.target.value })} />
          </label>
          <label className={labelCls}>
            <span className={labelTextCls}>a*</span>
            <input className={inputCls} value={form.colorA} onChange={(e) => setForm({ ...form, colorA: e.target.value })} />
          </label>
          <label className={labelCls}>
            <span className={labelTextCls}>b*</span>
            <input className={inputCls} value={form.colorB} onChange={(e) => setForm({ ...form, colorB: e.target.value })} />
          </label>
        </div>
      </div>

      <div className="rounded-lg border bg-white p-4">
        <div className="text-sm font-medium">pH</div>
        <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2">
          <label className={labelCls}>
            <span className={labelTextCls}>pH(1h)</span>
            <input className={inputCls} value={form.ph1h} onChange={(e) => setForm({ ...form, ph1h: e.target.value })} />
          </label>
          <label className={labelCls}>
            <span className={labelTextCls}>pH(24h)</span>
            <input className={inputCls} value={form.ph24h} onChange={(e) => setForm({ ...form, ph24h: e.target.value })} />
          </label>
        </div>
      </div>

      <div className="rounded-lg border bg-white p-4">
        <div className="text-sm font-medium">系水力 / 滴水损失</div>
        <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2">
          <label className={labelCls}>
            <span className={labelTextCls}>系水力(%)</span>
            <input className={inputCls} value={form.waterHoldingPct} onChange={(e) => setForm({ ...form, waterHoldingPct: e.target.value })} />
          </label>
          <label className={labelCls}>
            <span className={labelTextCls}>滴水损失(%)</span>
            <input className={inputCls} value={form.dripLossPct} onChange={(e) => setForm({ ...form, dripLossPct: e.target.value })} />
          </label>
        </div>
      </div>

      <div className="rounded-lg border bg-white p-4">
        <div className="text-sm font-medium">脂肪 / 水分</div>
        <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2">
          <label className={labelCls}>
            <span className={labelTextCls}>大理石纹评分（1~6，0.5分档）</span>
            <input className={inputCls} value={form.marblingScore} onChange={(e) => setForm({ ...form, marblingScore: e.target.value })} />
          </label>
          <label className={labelCls}>
            <span className={labelTextCls}>肌内脂肪(%)</span>
            <input className={inputCls} value={form.imfPct} onChange={(e) => setForm({ ...form, imfPct: e.target.value })} />
          </label>
          <label className={labelCls}>
            <span className={labelTextCls}>肌间脂肪(%)</span>
            <input className={inputCls} value={form.impPct} onChange={(e) => setForm({ ...form, impPct: e.target.value })} />
          </label>
          <label className={labelCls}>
            <span className={labelTextCls}>水分(%)</span>
            <input className={inputCls} value={form.moisturePct} onChange={(e) => setForm({ ...form, moisturePct: e.target.value })} />
          </label>
        </div>
      </div>

      <div className="rounded-lg border bg-white p-4">
        <div className="text-sm font-medium">嫩度 / 熟肉率</div>
        <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2">
          <label className={labelCls}>
            <span className={labelTextCls}>嫩度剪切力(N)</span>
            <input className={inputCls} value={form.tendernessShearN} onChange={(e) => setForm({ ...form, tendernessShearN: e.target.value })} />
          </label>
          <label className={labelCls}>
            <span className={labelTextCls}>熟肉率(%)</span>
            <input className={inputCls} value={form.cookedMeatRate} onChange={(e) => setForm({ ...form, cookedMeatRate: e.target.value })} />
          </label>
        </div>
      </div>

      <div className="rounded-lg border bg-white p-4">
        <div className="text-sm font-medium">备注</div>
        <div className="mt-3">
          <textarea
            className="min-h-24 w-full rounded-md border p-3 text-sm"
            value={form.remark}
            onChange={(e) => setForm({ ...form, remark: e.target.value })}
            placeholder="最多500字"
          />
        </div>
      </div>

      {resp?.record ? (
        <div className="rounded-lg border bg-white p-4">
          <div className="text-sm text-zinc-600">已保存记录</div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
            <div>
              <span className="text-zinc-500">pH(1h)：</span>
              <span className="font-medium">{resp.record.ph1h ?? ""}</span>
            </div>
            <div>
              <span className="text-zinc-500">pH(24h)：</span>
              <span className="font-medium">{resp.record.ph24h ?? ""}</span>
            </div>
          </div>
        </div>
      ) : null}

      <div className="flex items-center gap-3">
        <button className="h-10 rounded-md bg-black px-4 text-white disabled:opacity-50" onClick={onSave} disabled={saving}>
          {saving ? "保存中..." : "保存"}
        </button>
        <button className="h-10 rounded-md border px-4" onClick={reload}>
          刷新
        </button>
      </div>
    </div>
  );
}
