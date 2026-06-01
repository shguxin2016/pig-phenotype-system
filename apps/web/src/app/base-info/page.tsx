"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { clearToken, getToken } from "@/lib/auth";

type Unit = { id: number; name: string; type: string };
type JwtPayload = { unitId?: number; role?: string; username?: string };

type BaseInfoRecord = {
  id: number;
  unitId: number;
  year: number;
  data: Record<string, any>;
  fillDate: string | null;
};

type PutResp = { record: BaseInfoRecord; warnings: string[] };

const decodeJwtPayload = (token: string): JwtPayload | null => {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const json = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));
    return json as JwtPayload;
  } catch {
    return null;
  }
};

const defaultData = () => ({
  name: "",
  level: "",
  code: "",
  address: "",
  principal: "",
  phone: "",
  email: "",
  farmCode: "",
  technicianCount: "",
  technicalPrincipal: "",
  technicalTitleOrDegree: "",
  protectedBreedName: "",
  inStockCount: "",
  familyCount: "",
  breedingCount: "",
  breedingMaleCount: "",
  breedingFemaleBaseCount: "",
  reserveCount: "",
  reserveMaleCount: "",
  reserveFemaleCount: "",
  landAreaM2: "",
  housingAreaM2: "",
  fixedAssets10kCny: "",
  filler: "",
  contact: "",
  fillDate: "",
});

const toNumberOrNull = (v: any) => {
  if (v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = String(v).trim();
  if (s.length === 0) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

export default function BaseInfoPage() {
  const router = useRouter();
  const [units, setUnits] = useState<Unit[]>([]);
  const [unitId, setUnitId] = useState<number | null>(null);
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [data, setData] = useState<Record<string, any>>(defaultData);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const payload = useMemo(() => {
    const token = getToken();
    if (!token) return null;
    return decodeJwtPayload(token);
  }, []);

  const role = payload?.role ?? null;
  const canEdit = role !== "测定中心";
  const unitSelectorEnabled = role !== "保种场";

  const handle401 = useCallback(() => {
    clearToken();
    router.replace("/login");
  }, [router]);

  useEffect(() => {
    if (!getToken()) router.replace("/login");
  }, [router]);

  useEffect(() => {
    apiFetch<Unit[]>("/meta/units", { auth: false })
      .then((rows) => {
        setUnits(rows);
        if (payload?.unitId) setUnitId(payload.unitId);
        else if (rows.length > 0) setUnitId(rows[0]?.id ?? null);
      })
      .catch(() => setError("无法加载单位列表"));
  }, [payload?.unitId]);

  const fetchRecord = useCallback(async () => {
    if (!getToken()) return;
    if (!year.trim()) return;
    if (unitSelectorEnabled && !unitId) return;
    if (role === "测定中心" && !unitId) return;

    setBusy(true);
    setError(null);
    setWarnings([]);
    try {
      const qs = new URLSearchParams();
      qs.set("year", year.trim());
      if (unitId) qs.set("unitId", String(unitId));
      const res = await apiFetch<BaseInfoRecord | null>(`/base-info?${qs.toString()}`);
      if (!res) {
        setData(defaultData());
        return;
      }
      setData({ ...defaultData(), ...(res.data ?? {}), fillDate: res.fillDate ?? (res.data as any)?.fillDate ?? "" });
    } catch (e: any) {
      if (e?.status === 401) return handle401();
      setError(e?.message ?? "加载失败");
    } finally {
      setBusy(false);
    }
  }, [handle401, role, unitId, unitSelectorEnabled, year]);

  useEffect(() => {
    fetchRecord();
  }, [fetchRecord]);

  const update = (key: string, value: any) => setData((d) => ({ ...d, [key]: value }));

  const onSave = async () => {
    if (!canEdit) return;
    if (!year.trim()) return setError("请输入年度");
    if (unitSelectorEnabled && !unitId) return setError("请选择单位");
    if (!unitId) return setError("请选择单位");

    setBusy(true);
    setError(null);
    setWarnings([]);
    try {
      const qs = new URLSearchParams();
      qs.set("year", year.trim());
      qs.set("unitId", String(unitId));

      const payloadData = {
        ...data,
        technicianCount: toNumberOrNull(data.technicianCount),
        inStockCount: toNumberOrNull(data.inStockCount),
        familyCount: toNumberOrNull(data.familyCount),
        breedingCount: toNumberOrNull(data.breedingCount),
        breedingMaleCount: toNumberOrNull(data.breedingMaleCount),
        breedingFemaleBaseCount: toNumberOrNull(data.breedingFemaleBaseCount),
        reserveCount: toNumberOrNull(data.reserveCount),
        reserveMaleCount: toNumberOrNull(data.reserveMaleCount),
        reserveFemaleCount: toNumberOrNull(data.reserveFemaleCount),
        landAreaM2: toNumberOrNull(data.landAreaM2),
        housingAreaM2: toNumberOrNull(data.housingAreaM2),
        fixedAssets10kCny: toNumberOrNull(data.fixedAssets10kCny),
      };

      const res = await apiFetch<PutResp>(`/base-info?${qs.toString()}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: payloadData }),
      });

      setWarnings(res.warnings ?? []);
      setData({ ...defaultData(), ...(res.record.data ?? {}), fillDate: res.record.fillDate ?? (res.record.data as any)?.fillDate ?? "" });
    } catch (e: any) {
      if (e?.status === 401) return handle401();
      setError(e?.message ?? "保存失败");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-1 flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <div className="text-xl font-semibold">基本信息登记表（按年度）</div>
        <Link className="text-blue-600 hover:underline" href="/pigs">
          返回猪只列表
        </Link>
      </div>

      {error ? <div className="text-sm text-red-600">{error}</div> : null}
      {warnings.length ? (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          {warnings.map((w, idx) => (
            <div key={idx}>{w}</div>
          ))}
        </div>
      ) : null}

      <div className="rounded-lg border bg-white p-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <label className="grid gap-2 text-sm">
            <span className="text-zinc-600">年度</span>
            <input className="h-10 rounded-md border px-3" value={year} onChange={(e) => setYear(e.target.value)} />
          </label>

          <label className="grid gap-2 text-sm">
            <span className="text-zinc-600">单位</span>
            <select
              className="h-10 rounded-md border px-3"
              value={unitId ?? ""}
              onChange={(e) => setUnitId(e.target.value ? Number(e.target.value) : null)}
              disabled={!unitSelectorEnabled || !canEdit}
            >
              {units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </label>

          <div className="flex items-end gap-2">
            <button className="h-10 rounded-md border px-3 text-sm" onClick={fetchRecord} disabled={busy}>
              刷新
            </button>
            {canEdit ? (
              <button className="h-10 rounded-md bg-black px-3 text-sm text-white" onClick={onSave} disabled={busy}>
                保存
              </button>
            ) : null}
          </div>
        </div>
      </div>

      <Section title="基础信息">
        <Field label="名称" value={data.name} onChange={(v) => update("name", v)} disabled={!canEdit} />
        <SelectField
          label="级别"
          value={data.level}
          onChange={(v) => update("level", v)}
          disabled={!canEdit}
          options={["", "国家级", "省级", "其他"]}
        />
        <Field label="编号" value={data.code} onChange={(v) => update("code", v)} disabled={!canEdit} />
        <Field label="地址" value={data.address} onChange={(v) => update("address", v)} disabled={!canEdit} />
        <Field label="负责人" value={data.principal} onChange={(v) => update("principal", v)} disabled={!canEdit} />
        <Field label="电话" value={data.phone} onChange={(v) => update("phone", v)} disabled={!canEdit} />
        <Field label="邮箱" value={data.email} onChange={(v) => update("email", v)} disabled={!canEdit} />
        <Field label="畜禽养殖场代码" value={data.farmCode} onChange={(v) => update("farmCode", v)} disabled={!canEdit} />
        <NumberField label="专业技术人员数量" value={data.technicianCount} onChange={(v) => update("technicianCount", v)} disabled={!canEdit} />
        <Field label="技术负责人" value={data.technicalPrincipal} onChange={(v) => update("technicalPrincipal", v)} disabled={!canEdit} />
        <Field label="学历或职称" value={data.technicalTitleOrDegree} onChange={(v) => update("technicalTitleOrDegree", v)} disabled={!canEdit} />
        <Field label="保护品种名称" value={data.protectedBreedName} onChange={(v) => update("protectedBreedName", v)} disabled={!canEdit} />
      </Section>

      <Section title="群体规模">
        <NumberField label="存栏数量" value={data.inStockCount} onChange={(v) => update("inStockCount", v)} disabled={!canEdit} />
        <NumberField label="家系数量" value={data.familyCount} onChange={(v) => update("familyCount", v)} disabled={!canEdit} />
        <NumberField label="种畜数量" value={data.breedingCount} onChange={(v) => update("breedingCount", v)} disabled={!canEdit} />
        <NumberField label="种公畜数量" value={data.breedingMaleCount} onChange={(v) => update("breedingMaleCount", v)} disabled={!canEdit} />
        <NumberField label="基础母畜数量" value={data.breedingFemaleBaseCount} onChange={(v) => update("breedingFemaleBaseCount", v)} disabled={!canEdit} />
        <NumberField label="后备畜群数量" value={data.reserveCount} onChange={(v) => update("reserveCount", v)} disabled={!canEdit} />
        <NumberField label="后备公畜数量" value={data.reserveMaleCount} onChange={(v) => update("reserveMaleCount", v)} disabled={!canEdit} />
        <NumberField label="后备母畜数量" value={data.reserveFemaleCount} onChange={(v) => update("reserveFemaleCount", v)} disabled={!canEdit} />
      </Section>

      <Section title="资源与填报">
        <NumberField label="占地面积(㎡)" value={data.landAreaM2} onChange={(v) => update("landAreaM2", v)} disabled={!canEdit} />
        <NumberField label="畜舍面积(㎡)" value={data.housingAreaM2} onChange={(v) => update("housingAreaM2", v)} disabled={!canEdit} />
        <NumberField label="固定资产(万元)" value={data.fixedAssets10kCny} onChange={(v) => update("fixedAssets10kCny", v)} disabled={!canEdit} />
        <Field label="填表人" value={data.filler} onChange={(v) => update("filler", v)} disabled={!canEdit} />
        <Field label="联系方式" value={data.contact} onChange={(v) => update("contact", v)} disabled={!canEdit} />
        <DateField label="日期" value={data.fillDate} onChange={(v) => update("fillDate", v)} disabled={!canEdit} />
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: any }) {
  return (
    <div className="rounded-lg border bg-white p-4">
      <div className="mb-3 text-base font-semibold">{title}</div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">{children}</div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: any;
  onChange: (v: string) => void;
  disabled: boolean;
}) {
  return (
    <label className="grid gap-2 text-sm">
      <span className="text-zinc-600">{label}</span>
      <input
        className="h-10 rounded-md border px-3"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
      />
    </label>
  );
}

function NumberField({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: any;
  onChange: (v: string) => void;
  disabled: boolean;
}) {
  return (
    <label className="grid gap-2 text-sm">
      <span className="text-zinc-600">{label}</span>
      <input
        className="h-10 rounded-md border px-3"
        type="number"
        step="any"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
      />
    </label>
  );
}

function DateField({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: any;
  onChange: (v: string) => void;
  disabled: boolean;
}) {
  return (
    <label className="grid gap-2 text-sm">
      <span className="text-zinc-600">{label}</span>
      <input
        className="h-10 rounded-md border px-3"
        type="date"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
      />
    </label>
  );
}

function SelectField({
  label,
  value,
  onChange,
  disabled,
  options,
}: {
  label: string;
  value: any;
  onChange: (v: string) => void;
  disabled: boolean;
  options: string[];
}) {
  return (
    <label className="grid gap-2 text-sm">
      <span className="text-zinc-600">{label}</span>
      <select
        className="h-10 rounded-md border px-3"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o || "请选择"}
          </option>
        ))}
      </select>
    </label>
  );
}

