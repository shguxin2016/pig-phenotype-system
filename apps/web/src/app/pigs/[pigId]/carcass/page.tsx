"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { clearToken } from "@/lib/auth";

type Pig = { id: number; earTagNo: string; individualNo: string | null; birthDate: string; sex: string };

type CarcassRecord = {
  pigId: number;
  slaughterDate: string | null;
  preSlaughterWeightKg: number | null;
  carcassWeightLeftKg: number | null;
  carcassWeightRightKg: number | null;
  carcassLengthCm: number | null;
  bodyObliqueLengthCm: number | null;
  backfatShoulderMm: number | null;
  backfatLastRibMm: number | null;
  backfatLumbarMm: number | null;
  skinThickness6_7RibMm: number | null;
  emaLastRibCm2: number | null;
  emaHeightCm: number | null;
  emaWidthCm: number | null;
  leftDetachSkinKg: number | null;
  leftDetachBoneKg: number | null;
  leftDetachFatKg: number | null;
  leftDetachLeanKg: number | null;
  leftLegWeightKg: number | null;
  hoofWeightKg: number | null;
  headWeightKg: number | null;
  ribCount: number | null;
  detachLossPct: number | null;
  legHipRatioPct: number | null;
  skinRatePct: number | null;
  boneRatePct: number | null;
  fatRatePct: number | null;
  leanRatePct: number | null;
  slaughterRatePct: number | null;
};

type CarcassResp = { record: CarcassRecord; warnings: string[] } | null;

const toNum = (s: string): number | null => {
  const t = s.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};

const inputCls = "h-10 rounded-md border px-3";
const labelCls = "grid gap-2 text-sm";
const labelTextCls = "text-zinc-600";

export default function CarcassPage() {
  const router = useRouter();
  const params = useParams<{ pigId: string }>();
  const pigId = Number(params.pigId);

  const [pig, setPig] = useState<Pig | null>(null);
  const [resp, setResp] = useState<CarcassResp>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    slaughterDate: "",
    preSlaughterWeightKg: "",
    carcassWeightLeftKg: "",
    carcassWeightRightKg: "",
    ribCount: "",
    carcassLengthCm: "",
    bodyObliqueLengthCm: "",
    backfatShoulderMm: "",
    backfatLastRibMm: "",
    backfatLumbarMm: "",
    skinThickness6_7RibMm: "",
    emaLastRibCm2: "",
    emaHeightCm: "",
    emaWidthCm: "",
    leftDetachSkinKg: "",
    leftDetachBoneKg: "",
    leftDetachFatKg: "",
    leftDetachLeanKg: "",
    leftLegWeightKg: "",
    hoofWeightKg: "",
    headWeightKg: "",
  });

  const reload = useCallback(() => {
    return Promise.resolve()
      .then(() => apiFetch<Pig>(`/pigs/${pigId}`))
      .then((p) => {
        setPig(p);
        return apiFetch<CarcassResp>(`/pigs/${pigId}/carcass`);
      })
      .then((r) => {
        setResp(r);
        setWarnings(r?.warnings ?? []);
        const rec = r?.record;
        setForm({
          slaughterDate: rec?.slaughterDate ?? "",
          preSlaughterWeightKg: rec?.preSlaughterWeightKg == null ? "" : String(rec.preSlaughterWeightKg),
          carcassWeightLeftKg: rec?.carcassWeightLeftKg == null ? "" : String(rec.carcassWeightLeftKg),
          carcassWeightRightKg: rec?.carcassWeightRightKg == null ? "" : String(rec.carcassWeightRightKg),
          ribCount: rec?.ribCount == null ? "" : String(rec.ribCount),
          carcassLengthCm: rec?.carcassLengthCm == null ? "" : String(rec.carcassLengthCm),
          bodyObliqueLengthCm: rec?.bodyObliqueLengthCm == null ? "" : String(rec.bodyObliqueLengthCm),
          backfatShoulderMm: rec?.backfatShoulderMm == null ? "" : String(rec.backfatShoulderMm),
          backfatLastRibMm: rec?.backfatLastRibMm == null ? "" : String(rec.backfatLastRibMm),
          backfatLumbarMm: rec?.backfatLumbarMm == null ? "" : String(rec.backfatLumbarMm),
          skinThickness6_7RibMm: rec?.skinThickness6_7RibMm == null ? "" : String(rec.skinThickness6_7RibMm),
          emaLastRibCm2: rec?.emaLastRibCm2 == null ? "" : String(rec.emaLastRibCm2),
          emaHeightCm: rec?.emaHeightCm == null ? "" : String(rec.emaHeightCm),
          emaWidthCm: rec?.emaWidthCm == null ? "" : String(rec.emaWidthCm),
          leftDetachSkinKg: rec?.leftDetachSkinKg == null ? "" : String(rec.leftDetachSkinKg),
          leftDetachBoneKg: rec?.leftDetachBoneKg == null ? "" : String(rec.leftDetachBoneKg),
          leftDetachFatKg: rec?.leftDetachFatKg == null ? "" : String(rec.leftDetachFatKg),
          leftDetachLeanKg: rec?.leftDetachLeanKg == null ? "" : String(rec.leftDetachLeanKg),
          leftLegWeightKg: rec?.leftLegWeightKg == null ? "" : String(rec.leftLegWeightKg),
          hoofWeightKg: rec?.hoofWeightKg == null ? "" : String(rec.hoofWeightKg),
          headWeightKg: rec?.headWeightKg == null ? "" : String(rec.headWeightKg),
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

  const avgBackfatMm = useMemo(() => {
    const a = toNum(form.backfatShoulderMm);
    const b = toNum(form.backfatLastRibMm);
    const c = toNum(form.backfatLumbarMm);
    if (a == null || b == null || c == null) return null;
    return (a + b + c) / 3;
  }, [form.backfatLastRibMm, form.backfatLumbarMm, form.backfatShoulderMm]);

  const onSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const r = await apiFetch<NonNullable<CarcassResp>>(`/pigs/${pigId}/carcass`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slaughterDate: form.slaughterDate.trim() || null,
          preSlaughterWeightKg: toNum(form.preSlaughterWeightKg),
          carcassWeightLeftKg: toNum(form.carcassWeightLeftKg),
          carcassWeightRightKg: toNum(form.carcassWeightRightKg),
          ribCount: toNum(form.ribCount),
          carcassLengthCm: toNum(form.carcassLengthCm),
          bodyObliqueLengthCm: toNum(form.bodyObliqueLengthCm),
          backfatShoulderMm: toNum(form.backfatShoulderMm),
          backfatLastRibMm: toNum(form.backfatLastRibMm),
          backfatLumbarMm: toNum(form.backfatLumbarMm),
          skinThickness6_7RibMm: toNum(form.skinThickness6_7RibMm),
          emaLastRibCm2: toNum(form.emaLastRibCm2),
          emaHeightCm: toNum(form.emaHeightCm),
          emaWidthCm: toNum(form.emaWidthCm),
          leftDetachSkinKg: toNum(form.leftDetachSkinKg),
          leftDetachBoneKg: toNum(form.leftDetachBoneKg),
          leftDetachFatKg: toNum(form.leftDetachFatKg),
          leftDetachLeanKg: toNum(form.leftDetachLeanKg),
          leftLegWeightKg: toNum(form.leftLegWeightKg),
          hoofWeightKg: toNum(form.hoofWeightKg),
          headWeightKg: toNum(form.headWeightKg),
        }),
      });
      setResp(r);
      setWarnings(r.warnings ?? []);
    } catch (err: unknown) {
      const e = err as { message?: string };
      setError(typeof e.message === "string" ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const computed = resp?.record;

  return (
    <div className="flex flex-1 flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <div className="text-xl font-semibold">胴体性状</div>
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
        <div className="text-sm font-medium">基础</div>
        <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2">
          <label className={labelCls}>
            <span className={labelTextCls}>屠宰日期</span>
            <input className={inputCls} value={form.slaughterDate} onChange={(e) => setForm({ ...form, slaughterDate: e.target.value })} placeholder="YYYY-MM-DD" />
          </label>
          <label className={labelCls}>
            <span className={labelTextCls}>宰前活重(kg)</span>
            <input className={inputCls} value={form.preSlaughterWeightKg} onChange={(e) => setForm({ ...form, preSlaughterWeightKg: e.target.value })} />
          </label>
          <label className={labelCls}>
            <span className={labelTextCls}>左胴体重(kg)</span>
            <input className={inputCls} value={form.carcassWeightLeftKg} onChange={(e) => setForm({ ...form, carcassWeightLeftKg: e.target.value })} />
          </label>
          <label className={labelCls}>
            <span className={labelTextCls}>右胴体重(kg)</span>
            <input className={inputCls} value={form.carcassWeightRightKg} onChange={(e) => setForm({ ...form, carcassWeightRightKg: e.target.value })} />
          </label>
          <label className={labelCls}>
            <span className={labelTextCls}>肋骨数</span>
            <input className={inputCls} value={form.ribCount} onChange={(e) => setForm({ ...form, ribCount: e.target.value })} />
          </label>
        </div>
      </div>

      <div className="rounded-lg border bg-white p-4">
        <div className="text-sm font-medium">测量</div>
        <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2">
          <label className={labelCls}>
            <span className={labelTextCls}>胴体长(cm)</span>
            <input className={inputCls} value={form.carcassLengthCm} onChange={(e) => setForm({ ...form, carcassLengthCm: e.target.value })} />
          </label>
          <label className={labelCls}>
            <span className={labelTextCls}>体斜长(cm)</span>
            <input className={inputCls} value={form.bodyObliqueLengthCm} onChange={(e) => setForm({ ...form, bodyObliqueLengthCm: e.target.value })} />
          </label>
          <label className={labelCls}>
            <span className={labelTextCls}>背膘(肩)(mm)</span>
            <input className={inputCls} value={form.backfatShoulderMm} onChange={(e) => setForm({ ...form, backfatShoulderMm: e.target.value })} />
          </label>
          <label className={labelCls}>
            <span className={labelTextCls}>背膘(最后肋)(mm)</span>
            <input className={inputCls} value={form.backfatLastRibMm} onChange={(e) => setForm({ ...form, backfatLastRibMm: e.target.value })} />
          </label>
          <label className={labelCls}>
            <span className={labelTextCls}>背膘(腰荐)(mm)</span>
            <input className={inputCls} value={form.backfatLumbarMm} onChange={(e) => setForm({ ...form, backfatLumbarMm: e.target.value })} />
          </label>
          <label className={labelCls}>
            <span className={labelTextCls}>皮厚(6~7肋)(mm)</span>
            <input className={inputCls} value={form.skinThickness6_7RibMm} onChange={(e) => setForm({ ...form, skinThickness6_7RibMm: e.target.value })} />
          </label>
          <label className={labelCls}>
            <span className={labelTextCls}>眼肌面积(cm²)</span>
            <input className={inputCls} value={form.emaLastRibCm2} onChange={(e) => setForm({ ...form, emaLastRibCm2: e.target.value })} />
          </label>
          <label className={labelCls}>
            <span className={labelTextCls}>眼肌高(cm)</span>
            <input className={inputCls} value={form.emaHeightCm} onChange={(e) => setForm({ ...form, emaHeightCm: e.target.value })} />
          </label>
          <label className={labelCls}>
            <span className={labelTextCls}>眼肌宽(cm)</span>
            <input className={inputCls} value={form.emaWidthCm} onChange={(e) => setForm({ ...form, emaWidthCm: e.target.value })} />
          </label>
        </div>
      </div>

      <div className="rounded-lg border bg-white p-4">
        <div className="text-sm font-medium">分割（左半胴体）</div>
        <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2">
          <label className={labelCls}>
            <span className={labelTextCls}>皮重(kg)</span>
            <input className={inputCls} value={form.leftDetachSkinKg} onChange={(e) => setForm({ ...form, leftDetachSkinKg: e.target.value })} />
          </label>
          <label className={labelCls}>
            <span className={labelTextCls}>骨重(kg)</span>
            <input className={inputCls} value={form.leftDetachBoneKg} onChange={(e) => setForm({ ...form, leftDetachBoneKg: e.target.value })} />
          </label>
          <label className={labelCls}>
            <span className={labelTextCls}>肥肉重(kg)</span>
            <input className={inputCls} value={form.leftDetachFatKg} onChange={(e) => setForm({ ...form, leftDetachFatKg: e.target.value })} />
          </label>
          <label className={labelCls}>
            <span className={labelTextCls}>瘦肉重(kg)</span>
            <input className={inputCls} value={form.leftDetachLeanKg} onChange={(e) => setForm({ ...form, leftDetachLeanKg: e.target.value })} />
          </label>
          <label className={labelCls}>
            <span className={labelTextCls}>左腿臀重(kg)</span>
            <input className={inputCls} value={form.leftLegWeightKg} onChange={(e) => setForm({ ...form, leftLegWeightKg: e.target.value })} />
          </label>
          <label className={labelCls}>
            <span className={labelTextCls}>蹄重(kg)</span>
            <input className={inputCls} value={form.hoofWeightKg} onChange={(e) => setForm({ ...form, hoofWeightKg: e.target.value })} />
          </label>
          <label className={labelCls}>
            <span className={labelTextCls}>头重(kg)</span>
            <input className={inputCls} value={form.headWeightKg} onChange={(e) => setForm({ ...form, headWeightKg: e.target.value })} />
          </label>
        </div>
      </div>

      <div className="rounded-lg border bg-white p-4">
        <div className="text-sm font-medium">自动计算（NY/T 825-2004）</div>
        <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
          <div>
            <span className="text-zinc-500">屠宰率(%)：</span>
            <span className="font-medium">{computed?.slaughterRatePct == null ? "" : computed.slaughterRatePct.toFixed(3)}</span>
          </div>
          <div>
            <span className="text-zinc-500">腿臀比例(%)：</span>
            <span className="font-medium">{computed?.legHipRatioPct == null ? "" : computed.legHipRatioPct.toFixed(3)}</span>
          </div>
          <div>
            <span className="text-zinc-500">皮率(%)：</span>
            <span className="font-medium">{computed?.skinRatePct == null ? "" : computed.skinRatePct.toFixed(3)}</span>
          </div>
          <div>
            <span className="text-zinc-500">骨率(%)：</span>
            <span className="font-medium">{computed?.boneRatePct == null ? "" : computed.boneRatePct.toFixed(3)}</span>
          </div>
          <div>
            <span className="text-zinc-500">肥肉率(%)：</span>
            <span className="font-medium">{computed?.fatRatePct == null ? "" : computed.fatRatePct.toFixed(3)}</span>
          </div>
          <div>
            <span className="text-zinc-500">瘦肉率(%)：</span>
            <span className="font-medium">{computed?.leanRatePct == null ? "" : computed.leanRatePct.toFixed(3)}</span>
          </div>
          <div>
            <span className="text-zinc-500">分割损耗(%)：</span>
            <span className="font-medium">{computed?.detachLossPct == null ? "" : computed.detachLossPct.toFixed(3)}</span>
          </div>
          <div>
            <span className="text-zinc-500">平均背膘厚(mm)：</span>
            <span className="font-medium">{avgBackfatMm == null ? "" : avgBackfatMm.toFixed(2)}</span>
          </div>
        </div>
      </div>

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
