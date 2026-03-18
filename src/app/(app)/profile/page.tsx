"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

interface Profile {
  id: string;
  name: string;
  avatar: string | null;
  bio: string | null;
  shades: Array<{ name?: string }> | null;
  credits: number;
  totalOrders: number;
  totalEarnings: number;
  createdAt: string;
}

export default function ProfilePage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/");
      return;
    }
    if (status === "authenticated") {
      fetch("/api/v1/profile")
        .then((r) => r.json())
        .then(setProfile)
        .finally(() => setLoading(false));
    }
  }, [status, router]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-black pt-24 flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-2 border-gray-900 dark:border-white border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!profile) return null;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-black pt-24 px-6">
      <div className="max-w-2xl mx-auto space-y-8">
        {/* 分身档案卡 */}
        <div className="p-8 rounded-2xl bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800">
          <div className="flex items-center gap-6">
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-violet-500 to-indigo-500 flex items-center justify-center text-2xl font-bold text-white">
              {profile.avatar ? (
                <img src={profile.avatar} alt="" className="w-full h-full rounded-full object-cover" />
              ) : (
                profile.name[0]
              )}
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{profile.name}</h1>
              <p className="text-gray-500 dark:text-zinc-400 mt-1">{profile.bio || "这个人很懒，什么都没留下"}</p>
            </div>
          </div>

          {profile.shades && profile.shades.length > 0 && (
            <div className="mt-6 flex flex-wrap gap-2">
              {profile.shades.map((shade, i) => (
                <span
                  key={i}
                  className="px-3 py-1 bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-zinc-300 text-sm rounded-full border border-gray-200 dark:border-zinc-700"
                >
                  {shade.name || String(shade)}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* 运营数据 */}
        <div className="grid grid-cols-3 gap-4">
          <div className="p-6 rounded-2xl bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 text-center">
            <div className="text-3xl font-bold text-gray-900 dark:text-white">{profile.credits}</div>
            <div className="text-sm text-gray-400 dark:text-zinc-500 mt-1">Credit 余额</div>
          </div>
          <div className="p-6 rounded-2xl bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 text-center">
            <div className="text-3xl font-bold text-gray-900 dark:text-white">{profile.totalOrders}</div>
            <div className="text-sm text-gray-400 dark:text-zinc-500 mt-1">接单总数</div>
          </div>
          <div className="p-6 rounded-2xl bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 text-center">
            <div className="text-3xl font-bold text-gray-900 dark:text-white">{profile.totalEarnings}</div>
            <div className="text-sm text-gray-400 dark:text-zinc-500 mt-1">总收入</div>
          </div>
        </div>

        <div className="text-sm text-gray-400 dark:text-zinc-600 text-center">
          注册时间: {new Date(profile.createdAt).toLocaleDateString("zh-CN")}
        </div>
      </div>
    </div>
  );
}
