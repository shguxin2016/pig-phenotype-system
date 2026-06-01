"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { clearToken } from "@/lib/auth";

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

export default function PigDetailPage() {
  const router = useRouter();
  const params = useParams<{ pigId: string }>();
  const pigId = Number(params.pigId);
  const [pig, setPig] = useState<Pig | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<Pig>(`/pigs/${pigId}`)
      .then(setPig)
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

  return (
    <div className="flex flex-1 flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <div className="text-xl font-semibold">猪只详情</div>
        <Link className="text-blue-600 hover:underline" href="/pigs">
          返回列表
        </Link>
      </div>

      {error ? <div className="text-sm text-red-600">{error}</div> : null}

      {pig ? (
        <div className="rounded-lg border bg-white p-4">
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <span className="text-zinc-500">耳标号：</span>
              <span className="font-medium">{pig.earTagNo}</span>
            </div>
            <div>
              <span className="text-zinc-500">个体号：</span>
              <span className="font-medium">{pig.individualNo ?? ""}</span>
            </div>
            <div>
              <span className="text-zinc-500">性别：</span>
              <span className="font-medium">{pig.sex}</span>
            </div>
            <div>
              <span className="text-zinc-500">出生日期：</span>
              <span className="font-medium">{pig.birthDate}</span>
            </div>
            <div className="col-span-2">
              <span className="text-zinc-500">母猪耳号：</span>
              <span className="font-medium">{pig.damEarTagNo ?? ""}</span>
            </div>
          </div>
        </div>
      ) : null}

      <div className="rounded-lg border bg-white p-4">
        <div className="text-sm text-zinc-600">测定记录</div>
        <div className="mt-3 flex gap-4 text-sm">
          <Link className="text-blue-600 hover:underline" href={`/pigs/${pigId}/growth`}>
            生长性能
          </Link>
          <Link className="text-blue-600 hover:underline" href={`/pigs/${pigId}/repro`}>
            繁殖性能
          </Link>
          <Link className="text-blue-600 hover:underline" href={`/pigs/${pigId}/carcass`}>
            胴体性状
          </Link>
          <Link className="text-blue-600 hover:underline" href={`/pigs/${pigId}/meatq`}>
            猪肉品质
          </Link>
        </div>
      </div>
    </div>
  );
}
