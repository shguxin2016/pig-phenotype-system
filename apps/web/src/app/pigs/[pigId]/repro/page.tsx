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

type ReproPayload = {
  litter: {
    id: number;
    damEarTagNo: string;
    farrowingDate: string;
    boarEarTagNo: string | null;
    matingDate: string | null;
    parity: number | null;
    maleBorn: number | null;
    femaleBorn: number | null;
    totalBorn: number | null;
    stillbornCount: number | null;
    mummyCount: number | null;
    malformedCount: number | null;
    liveCount: number | null;
    weakCount: number | null;
    weanDate: string | null;
    weanCount: number | null;
    weanLitterWeightKg: number | null;
    remark: string | null;
  };
  piglet: {
    id: number;
    pigId: number;
    litterId: number;
    birthWeightKg: number | null;
    leftTeats: number | null;
    rightTeats: number | null;
    weanWeightIndKg: number | null;
    remark: string | null;
  };
} | null;

const toNum = (s: string): number | null => {
  const t = s.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};

export default function ReproPage() {
  const router = useRouter();
  const params = useParams<{ pigId: string }>();
  const pigId = Number(params.pigId);

  const [pig, setPig] = useState<Pig | null>(null);
  const [data, setData] = useState<ReproPayload>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [litter, setLitter] = useState({
    damEarTagNo: "",
    farrowingDate: "",
    boarEarTagNo: "",
    matingDate: "",
    parity: "",
    maleBorn: "",
    femaleBorn: "",
    stillbornCount: "",
    mummyCount: "",
    malformedCount: "",
    weakCount: "",
    weanDate: "",
    weanCount: "",
    weanLitterWeightKg: "",
  });

  const [piglet, setPiglet] = useState({
    birthWeightKg: "",
    leftTeats: "",
    rightTeats: "",
    weanWeightIndKg: "",
  });

  const reload = useCallback(() => {
    return Promise.resolve()
      .then(() => apiFetch<Pig>(`/pigs/${pigId}`))
      .then((p) => {
        setPig(p);
        return apiFetch<ReproPayload>(`/pigs/${pigId}/repro`);
      })
      .then((r) => {
        setData(r);
        setLitter({
          damEarTagNo: r?.litter.damEarTagNo ?? "",
          farrowingDate: r?.litter.farrowingDate ?? "",
          boarEarTagNo: r?.litter.boarEarTagNo ?? "",
          matingDate: r?.litter.matingDate ?? "",
          parity: r?.litter.parity == null ? "" : String(r.litter.parity),
          maleBorn: r?.litter.maleBorn == null ? "" : String(r.litter.maleBorn),
          femaleBorn: r?.litter.femaleBorn == null ? "" : String(r.litter.femaleBorn),
          stillbornCount: r?.litter.stillbornCount == null ? "" : String(r.litter.stillbornCount),
          mummyCount: r?.litter.mummyCount == null ? "" : String(r.litter.mummyCount),
          malformedCount: r?.litter.malformedCount == null ? "" : String(r.litter.malformedCount),
          weakCount: r?.litter.weakCount == null ? "" : String(r.litter.weakCount),
          weanDate: r?.litter.weanDate ?? "",
          weanCount: r?.litter.weanCount == null ? "" : String(r.litter.weanCount),
          weanLitterWeightKg: r?.litter.weanLitterWeightKg == null ? "" : String(r.litter.weanLitterWeightKg),
        });
        setPiglet({
          birthWeightKg: r?.piglet.birthWeightKg == null ? "" : String(r.piglet.birthWeightKg),
          leftTeats: r?.piglet.leftTeats == null ? "" : String(r.piglet.leftTeats),
          rightTeats: r?.piglet.rightTeats == null ? "" : String(r.piglet.rightTeats),
          weanWeightIndKg: r?.piglet.weanWeightIndKg == null ? "" : String(r.piglet.weanWeightIndKg),
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
    return litter.damEarTagNo.trim() && litter.farrowingDate.trim();
  }, [litter]);

  const onSave = async () => {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      const res = await apiFetch<ReproPayload>(`/pigs/${pigId}/repro`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          allowUpdateShared: true,
          litter: {
            damEarTagNo: litter.damEarTagNo.trim(),
            farrowingDate: litter.farrowingDate.trim(),
            boarEarTagNo: litter.boarEarTagNo.trim() || null,
            matingDate: litter.matingDate.trim() || null,
            parity: toNum(litter.parity),
            maleBorn: toNum(litter.maleBorn),
            femaleBorn: toNum(litter.femaleBorn),
            stillbornCount: toNum(litter.stillbornCount),
            mummyCount: toNum(litter.mummyCount),
            malformedCount: toNum(litter.malformedCount),
            weakCount: toNum(litter.weakCount),
            weanDate: litter.weanDate.trim() || null,
            weanCount: toNum(litter.weanCount),
            weanLitterWeightKg: toNum(litter.weanLitterWeightKg),
          },
          piglet: {
            birthWeightKg: toNum(piglet.birthWeightKg),
            leftTeats: toNum(piglet.leftTeats),
            rightTeats: toNum(piglet.rightTeats),
            weanWeightIndKg: toNum(piglet.weanWeightIndKg),
          },
        }),
      });
      setData(res);
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
        <div className="text-xl font-semibold">繁殖性能（母代窝）</div>
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

      {data?.litter ? (
        <div className="rounded-lg border bg-amber-50 p-4 text-sm text-amber-900">
          该窝记录为共享数据：同一“母猪耳号 + 分娩日期”对应同一窝。修改窝级字段会影响同窝下所有测定猪只。
        </div>
      ) : null}

      <div className="rounded-lg border bg-white p-4">
        <div className="text-sm font-medium">窝记录（共享）</div>
        <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2">
          <label className="grid gap-2 text-sm">
            <span className="text-zinc-600">母猪耳号</span>
            <input className="h-10 rounded-md border px-3" value={litter.damEarTagNo} onChange={(e) => setLitter({ ...litter, damEarTagNo: e.target.value })} />
          </label>
          <label className="grid gap-2 text-sm">
            <span className="text-zinc-600">分娩日期</span>
            <input className="h-10 rounded-md border px-3" value={litter.farrowingDate} onChange={(e) => setLitter({ ...litter, farrowingDate: e.target.value })} placeholder="YYYY-MM-DD" />
          </label>
          <label className="grid gap-2 text-sm">
            <span className="text-zinc-600">与配公猪耳号</span>
            <input className="h-10 rounded-md border px-3" value={litter.boarEarTagNo} onChange={(e) => setLitter({ ...litter, boarEarTagNo: e.target.value })} />
          </label>
          <label className="grid gap-2 text-sm">
            <span className="text-zinc-600">配种日期</span>
            <input className="h-10 rounded-md border px-3" value={litter.matingDate} onChange={(e) => setLitter({ ...litter, matingDate: e.target.value })} placeholder="YYYY-MM-DD" />
          </label>
          <label className="grid gap-2 text-sm">
            <span className="text-zinc-600">胎次</span>
            <input className="h-10 rounded-md border px-3" value={litter.parity} onChange={(e) => setLitter({ ...litter, parity: e.target.value })} />
          </label>
          <div />
          <label className="grid gap-2 text-sm">
            <span className="text-zinc-600">公仔数</span>
            <input className="h-10 rounded-md border px-3" value={litter.maleBorn} onChange={(e) => setLitter({ ...litter, maleBorn: e.target.value })} />
          </label>
          <label className="grid gap-2 text-sm">
            <span className="text-zinc-600">母仔数</span>
            <input className="h-10 rounded-md border px-3" value={litter.femaleBorn} onChange={(e) => setLitter({ ...litter, femaleBorn: e.target.value })} />
          </label>
          <label className="grid gap-2 text-sm">
            <span className="text-zinc-600">死胎数</span>
            <input className="h-10 rounded-md border px-3" value={litter.stillbornCount} onChange={(e) => setLitter({ ...litter, stillbornCount: e.target.value })} />
          </label>
          <label className="grid gap-2 text-sm">
            <span className="text-zinc-600">木乃伊胎数</span>
            <input className="h-10 rounded-md border px-3" value={litter.mummyCount} onChange={(e) => setLitter({ ...litter, mummyCount: e.target.value })} />
          </label>
          <label className="grid gap-2 text-sm">
            <span className="text-zinc-600">畸形数</span>
            <input className="h-10 rounded-md border px-3" value={litter.malformedCount} onChange={(e) => setLitter({ ...litter, malformedCount: e.target.value })} />
          </label>
          <label className="grid gap-2 text-sm">
            <span className="text-zinc-600">弱仔数</span>
            <input className="h-10 rounded-md border px-3" value={litter.weakCount} onChange={(e) => setLitter({ ...litter, weakCount: e.target.value })} />
          </label>
          <label className="grid gap-2 text-sm">
            <span className="text-zinc-600">断奶日期</span>
            <input className="h-10 rounded-md border px-3" value={litter.weanDate} onChange={(e) => setLitter({ ...litter, weanDate: e.target.value })} placeholder="YYYY-MM-DD" />
          </label>
          <label className="grid gap-2 text-sm">
            <span className="text-zinc-600">断奶仔猪数</span>
            <input className="h-10 rounded-md border px-3" value={litter.weanCount} onChange={(e) => setLitter({ ...litter, weanCount: e.target.value })} />
          </label>
          <label className="grid gap-2 text-sm md:col-span-2">
            <span className="text-zinc-600">断奶窝重(kg)</span>
            <input className="h-10 rounded-md border px-3" value={litter.weanLitterWeightKg} onChange={(e) => setLitter({ ...litter, weanLitterWeightKg: e.target.value })} />
          </label>
        </div>
      </div>

      <div className="rounded-lg border bg-white p-4">
        <div className="text-sm font-medium">本测定猪只在该窝下信息</div>
        <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2">
          <label className="grid gap-2 text-sm">
            <span className="text-zinc-600">初生重(kg)</span>
            <input className="h-10 rounded-md border px-3" value={piglet.birthWeightKg} onChange={(e) => setPiglet({ ...piglet, birthWeightKg: e.target.value })} />
          </label>
          <label className="grid gap-2 text-sm">
            <span className="text-zinc-600">断奶重(kg)</span>
            <input className="h-10 rounded-md border px-3" value={piglet.weanWeightIndKg} onChange={(e) => setPiglet({ ...piglet, weanWeightIndKg: e.target.value })} />
          </label>
          <label className="grid gap-2 text-sm">
            <span className="text-zinc-600">左乳头数</span>
            <input className="h-10 rounded-md border px-3" value={piglet.leftTeats} onChange={(e) => setPiglet({ ...piglet, leftTeats: e.target.value })} />
          </label>
          <label className="grid gap-2 text-sm">
            <span className="text-zinc-600">右乳头数</span>
            <input className="h-10 rounded-md border px-3" value={piglet.rightTeats} onChange={(e) => setPiglet({ ...piglet, rightTeats: e.target.value })} />
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
            <span className="text-zinc-500">总产仔数：</span>
            <span className="font-medium">{data?.litter.totalBorn ?? ""}</span>
          </div>
          <div>
            <span className="text-zinc-500">产活仔数：</span>
            <span className="font-medium">{data?.litter.liveCount ?? ""}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
