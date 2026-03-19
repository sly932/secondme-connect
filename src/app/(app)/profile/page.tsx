"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Image, { type ImageLoaderProps } from "next/image";

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

const passthroughImageLoader = ({ src }: ImageLoaderProps) => src;

const SHADE_COLORS = [
  "bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-300 border-indigo-200 dark:border-indigo-700",
  "bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-300 border-emerald-200 dark:border-emerald-700",
  "bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-300 border-amber-200 dark:border-amber-700",
  "bg-pink-50 dark:bg-pink-900/30 text-pink-600 dark:text-pink-300 border-pink-200 dark:border-pink-700",
  "bg-cyan-50 dark:bg-cyan-900/30 text-cyan-600 dark:text-cyan-300 border-cyan-200 dark:border-cyan-700",
  "bg-violet-50 dark:bg-violet-900/30 text-violet-600 dark:text-violet-300 border-violet-200 dark:border-violet-700",
];

export default function ProfilePage() {
  const { status } = useSession();
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
      <div className="min-h-screen bg-gray-50/50 dark:bg-zinc-950 pt-24 px-6">
        <div className="max-w-2xl mx-auto space-y-6 animate-pulse">
          {/* 档案卡骨架 */}
          <div className="p-8 rounded-2xl bg-white dark:bg-zinc-900/80 border border-gray-200/80 dark:border-zinc-800">
            <div className="flex items-center gap-6">
              <div className="w-20 h-20 rounded-full bg-gray-200 dark:bg-zinc-700" />
              <div className="space-y-3 flex-1">
                <div className="w-32 h-6 rounded bg-gray-200 dark:bg-zinc-700" />
                <div className="w-48 h-4 rounded bg-gray-200 dark:bg-zinc-700" />
              </div>
            </div>
            <div className="mt-6 flex gap-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="w-16 h-7 rounded-full bg-gray-200 dark:bg-zinc-700" />
              ))}
            </div>
          </div>
          {/* 数据卡骨架 */}
          <div className="grid grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="p-6 rounded-2xl bg-white dark:bg-zinc-900/80 border border-gray-200/80 dark:border-zinc-800 text-center space-y-2">
                <div className="w-12 h-8 rounded bg-gray-200 dark:bg-zinc-700 mx-auto" />
                <div className="w-16 h-3 rounded bg-gray-200 dark:bg-zinc-700 mx-auto" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!profile) return null;

  const STATS = [
    { value: profile.credits, label: "Credit 余额", gradient: "from-violet-500 to-indigo-500" },
    { value: profile.totalOrders, label: "接单总数", gradient: "from-emerald-500 to-teal-500" },
    { value: profile.totalEarnings, label: "总收入", gradient: "from-amber-500 to-orange-500" },
  ];

  return (
    <div className="min-h-screen bg-gray-50/50 dark:bg-zinc-950 pt-24 px-6">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* 分身档案卡 */}
        <div className="p-8 rounded-2xl bg-white dark:bg-zinc-900/80 border border-gray-200/80 dark:border-zinc-800 card-hover animate-fade-in-up">
          <div className="flex items-center gap-6">
            <div className="relative">
              <div className="absolute -inset-1 bg-gradient-to-br from-violet-500 to-indigo-500 rounded-full opacity-20 blur-md" />
              <div className="relative w-20 h-20 rounded-full bg-gradient-to-br from-violet-500 to-indigo-500 flex items-center justify-center text-2xl font-bold text-white ring-4 ring-white dark:ring-zinc-900">
                {profile.avatar ? (
                  <Image
                    loader={passthroughImageLoader}
                    unoptimized
                    src={profile.avatar}
                    alt={profile.name}
                    width={80}
                    height={80}
                    className="w-full h-full rounded-full object-cover"
                  />
                ) : (
                  (profile.name || "?")[0]
                )}
              </div>
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
                  className={`px-3 py-1 text-sm rounded-full border ${SHADE_COLORS[i % SHADE_COLORS.length]}`}
                >
                  {shade.name || String(shade)}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* 运营数据 */}
        <div className="grid grid-cols-3 gap-4">
          {STATS.map((stat, i) => (
            <div
              key={i}
              className="relative p-6 rounded-2xl bg-white dark:bg-zinc-900/80 border border-gray-200/80 dark:border-zinc-800 text-center card-hover overflow-hidden animate-fade-in-up"
              style={{ animationDelay: `${i * 0.1}s` }}
            >
              <div className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${stat.gradient}`} />
              <div className="text-3xl font-bold text-gray-900 dark:text-white">{stat.value}</div>
              <div className="text-sm text-gray-400 dark:text-zinc-500 mt-1">{stat.label}</div>
            </div>
          ))}
        </div>

        <div className="text-sm text-gray-400 dark:text-zinc-600 text-center pb-8">
          注册时间: {new Date(profile.createdAt).toLocaleDateString("zh-CN")}
        </div>
      </div>
    </div>
  );
}
