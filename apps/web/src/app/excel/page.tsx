"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { clearToken, getToken } from "@/lib/auth";

type Unit = { id: number; name: string; type: string };
type Breed = { id: number; name: string };

type JwtPayload = { unitId?: number; role?: string; username?: string };

type ImportSummary = { totalRows: number; validRows: number; errorRows: number; warningsCount: number };
type ImportError = { rowNumber: number; field: string | null; message: string };
type ValidateResp = { batchId: number; summary: ImportSummary; errors: ImportError[]; warnings: string[] };

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

const apiBase = () => process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001";

const downloadWithAuth = async (path: string, filename: string) => {
  const token = getToken();
  const res = await fetch(`${apiBase()}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (res.status === 401) throw { status: 401, message: "未登录" };
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw { status: res.status, message: text || "下载失败" };
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};

export default function ExcelPage() {
  const router = useRouter();
  const [units, setUnits] = useState<Unit[]>([]);
  const [breeds, setBreeds] = useState<Breed[]>([]);
  const [unitId, setUnitId] = useState<number | null>(null);
  const [moduleName, setModuleName] = useState("pigs");
  const [year, setYear] = useState(String(new Date().getFullYear()));

  const [file, setFile] = useState<File | null>(null);
  const [validateResult, setValidateResult] = useState<ValidateResp | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const payload = useMemo(() => {
    const token = getToken();
    if (!token) return null;
    return decodeJwtPayload(token);
  }, []);

  const role = payload?.role ?? null;

  const handle401 = useCallback(() => {
    clearToken();
    router.replace("/login");
  }, [router]);

  useEffect(() => {
    if (!getToken()) router.replace("/login");
  }, [router]);

  useEffect(() => {
    apiFetch<Unit[]>("/meta/units", { auth: false })
      .then((data) => {
        setUnits(data);
        if (payload?.unitId) setUnitId(payload.unitId);
        else if (data.length > 0) setUnitId(data[0]?.id ?? null);
      })
      .catch(() => {
        setError("无法加载单位列表");
      });
    apiFetch<Breed[]>("/meta/breeds", { auth: false }).then(setBreeds).catch(() => {});
  }, [payload?.unitId]);

  const unitSelectorEnabled = role !== "保种场";
  const canImport = role === "管理单位";
  const needYear = moduleName === "base_info";

  const onDownloadTemplate = async () => {
    setError(null);
    try {
      await downloadWithAuth(`/excel/templates/${moduleName}`, `${moduleName}-template.xlsx`);
    } catch (e: any) {
      if (e?.status === 401) return handle401();
      setError(e?.message ?? "下载失败");
    }
  };

  const onExportData = async () => {
    setError(null);
    try {
      const qs = new URLSearchParams();
      if (unitSelectorEnabled) {
        if (!unitId) throw new Error("请选择单位");
        qs.set("unitId", String(unitId));
      }
      if (needYear) qs.set("year", year.trim());
      const q = qs.toString();
      await downloadWithAuth(`/excel/exports/${moduleName}${q ? `?${q}` : ""}`, `${moduleName}-export.xlsx`);
    } catch (e: any) {
      if (e?.status === 401) return handle401();
      setError(e?.message ?? "导出失败");
    }
  };

  const onValidate = async () => {
    if (!file) return;
    setBusy(true);
    setError(null);
    setValidateResult(null);
    try {
      const token = getToken();
      const qs = new URLSearchParams();
      if (!unitId) throw new Error("请选择导入目标单位");
      qs.set("unitId", String(unitId));
      if (needYear) qs.set("year", year.trim());

      const fd = new FormData();
      fd.append("file", file);

      const res = await fetch(`${apiBase()}/excel/imports/${moduleName}/validate?${qs.toString()}`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        body: fd,
      });
      if (res.status === 401) return handle401();
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        const msg = typeof data?.message === "string" ? data.message : "校验失败";
        throw new Error(msg);
      }
      setValidateResult(data as ValidateResp);
    } catch (e: any) {
      setError(e?.message ?? "校验失败");
    } finally {
      setBusy(false);
    }
  };

  const onCommit = async () => {
    if (!validateResult) return;
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch<{ ok: boolean; inserted?: number }>(`/excel/imports/${moduleName}/commit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batchId: validateResult.batchId }),
      });
      setValidateResult({
        ...validateResult,
        warnings: validateResult.warnings.concat(res.inserted != null ? [`已写入 ${res.inserted} 行`] : []),
      });
    } catch (e: any) {
      if (e?.status === 401) return handle401();
      setError(e?.message ?? "提交失败");
    } finally {
      setBusy(false);
    }
  };

  const onDownloadErrors = async () => {
    if (!validateResult) return;
    setError(null);
    try {
      await downloadWithAuth(`/excel/imports/${validateResult.batchId}/errors`, `import-errors-${validateResult.batchId}.xlsx`);
    } catch (e: any) {
      if (e?.status === 401) return handle401();
      setError(e?.message ?? "下载失败");
    }
  };

  return (
    <div className="flex flex-1 flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <div className="text-xl font-semibold">Excel 导入导出</div>
        <div className="flex items-center gap-3">
          <Link className="text-blue-600 hover:underline" href="/stats/coverage">
            覆盖率统计
          </Link>
          <Link className="text-blue-600 hover:underline" href="/pigs">
            返回列表
          </Link>
        </div>
      </div>

      {error ? <div className="text-sm text-red-600">{error}</div> : null}

      <div className="rounded-lg border bg-white p-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <label className="grid gap-2 text-sm">
            <span className="text-zinc-600">模块</span>
            <select className="h-10 rounded-md border px-3" value={moduleName} onChange={(e) => setModuleName(e.target.value)}>
              <option value="pigs">猪只档案</option>
              <option value="growth">生长性能</option>
              <option value="repro">繁殖性能</option>
              <option value="carcass">胴体性状</option>
              <option value="meatq">猪肉品质</option>
              <option value="base_info">基本信息登记表</option>
            </select>
          </label>

          <label className="grid gap-2 text-sm">
            <span className="text-zinc-600">单位</span>
            <select
              className="h-10 rounded-md border px-3 disabled:bg-zinc-50"
              value={unitId ?? ""}
              onChange={(e) => setUnitId(e.target.value ? Number(e.target.value) : null)}
              disabled={!unitSelectorEnabled}
            >
              {unitSelectorEnabled ? <option value="">请选择</option> : null}
              {units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-2 text-sm">
            <span className="text-zinc-600">年度</span>
            <input
              className="h-10 rounded-md border px-3 disabled:bg-zinc-50"
              value={year}
              onChange={(e) => setYear(e.target.value)}
              disabled={!needYear}
              placeholder="YYYY"
            />
          </label>
        </div>

        <div className="mt-4 flex items-center gap-3">
          <button className="h-10 rounded-md border px-4" onClick={onDownloadTemplate}>
            下载模板
          </button>
          <button className="h-10 rounded-md bg-black px-4 text-white" onClick={onExportData}>
            导出数据
          </button>
        </div>
      </div>

      <div className="rounded-lg border bg-white p-4">
        <div className="text-sm font-medium">导入（仅管理单位）</div>
        {canImport ? (
          <>
            <div className="mt-3 flex flex-col gap-3 md:flex-row md:items-center">
              <input
                type="file"
                accept=".xlsx"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="text-sm"
              />
              <button className="h-10 rounded-md bg-black px-4 text-white disabled:opacity-50" onClick={onValidate} disabled={!file || busy}>
                {busy ? "处理中..." : "预校验"}
              </button>
              {validateResult?.errors?.length ? (
                <button className="h-10 rounded-md border px-4" onClick={onDownloadErrors}>
                  下载错误明细
                </button>
              ) : null}
              {validateResult && validateResult.errors.length === 0 ? (
                <button className="h-10 rounded-md border px-4" onClick={onCommit} disabled={busy}>
                  确认写入
                </button>
              ) : null}
            </div>

            {validateResult ? (
              <div className="mt-4 grid gap-3">
                <div className="rounded-md bg-zinc-50 p-3 text-sm text-zinc-700">
                  <div>批次：{validateResult.batchId}</div>
                  <div>
                    汇总：总行 {validateResult.summary.totalRows}，通过 {validateResult.summary.validRows}，错误 {validateResult.summary.errorRows}，warnings {validateResult.summary.warningsCount}
                  </div>
                </div>

                {validateResult.warnings.length > 0 ? (
                  <div className="rounded-lg border bg-amber-50 p-3 text-sm text-amber-900">
                    {validateResult.warnings.map((w, i) => (
                      <div key={i}>{w}</div>
                    ))}
                  </div>
                ) : null}

                {validateResult.errors.length > 0 ? (
                  <div className="rounded-lg border bg-white">
                    <div className="border-b bg-zinc-50 px-3 py-2 text-sm text-zinc-600">错误明细</div>
                    <div className="max-h-80 overflow-auto">
                      {validateResult.errors.map((e, i) => (
                        <div key={i} className="border-b px-3 py-2 text-sm">
                          <span className="text-zinc-500">行 {e.rowNumber}</span>
                          <span className="mx-2 text-zinc-300">|</span>
                          <span className="text-zinc-500">{e.field ?? ""}</span>
                          <span className="mx-2 text-zinc-300">|</span>
                          <span>{e.message}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
          </>
        ) : (
          <div className="mt-2 text-sm text-zinc-500">当前账号无导入权限。</div>
        )}
      </div>

      <div className="rounded-lg border bg-white p-4">
        <div className="text-sm font-medium">参考</div>
        <div className="mt-2 text-sm text-zinc-600">
          目前后端已完成 pigs（猪只档案）模块的模板/导出/导入端到端，其它模块会按既定里程碑逐步补齐。
        </div>
        {breeds.length > 0 ? (
          <div className="mt-2 text-sm text-zinc-600">品种可用值：{breeds.map((b) => b.name).join("、")}</div>
        ) : null}
      </div>
    </div>
  );
}
