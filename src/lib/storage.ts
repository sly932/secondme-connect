import { createClient } from "@supabase/supabase-js";
import logger from "./logger";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const BUCKET = "portraits";

/** 确保 bucket 存在（首次调用时自动创建） */
let bucketReady = false;
async function ensureBucket() {
  if (bucketReady) return;
  const { data } = await supabase.storage.getBucket(BUCKET);
  if (!data) {
    await supabase.storage.createBucket(BUCKET, { public: true });
    logger.info("Created storage bucket", { bucket: BUCKET });
  }
  bucketReady = true;
}

/**
 * 下载临时 URL 的图片并上传到 Supabase Storage
 * 返回永久公开 URL
 */
export async function uploadPortrait(
  userId: string,
  tempImageUrl: string
): Promise<string> {
  await ensureBucket();

  // 下载图片
  const res = await fetch(tempImageUrl);
  if (!res.ok) throw new Error(`Failed to download image: ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());

  const filePath = `${userId}.png`;

  // 上传（覆盖旧文件）
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(filePath, buffer, {
      contentType: "image/png",
      upsert: true,
    });

  if (error) throw new Error(`Upload failed: ${error.message}`);

  // 获取永久公开 URL
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(filePath);
  logger.info("Portrait uploaded", { userId, url: data.publicUrl });
  return data.publicUrl;
}
