import Link from "next/link";

export default function Home() {
  return (
    <div className="flex flex-1 items-center justify-center bg-zinc-50 p-6">
      <div className="w-full max-w-xl rounded-xl bg-white p-6 shadow">
        <div className="text-xl font-semibold">上海市地方品种猪表型测定记录管理系统</div>
        <div className="mt-2 text-sm text-zinc-600">当前为最小可用版本：登录、猪只档案列表与生长性能记录。</div>
        <div className="mt-6 flex gap-3">
          <Link className="h-10 rounded-md bg-black px-4 text-white inline-flex items-center" href="/login">
            登录
          </Link>
          <Link className="h-10 rounded-md border px-4 inline-flex items-center" href="/pigs">
            进入系统
          </Link>
        </div>
      </div>
    </div>
  );
}
