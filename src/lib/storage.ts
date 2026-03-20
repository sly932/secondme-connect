import { createClient } from "@supabase/supabase-js";
import logger from "./logger";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const PORTRAIT_BUCKET = "portraits";
const SCENE_BUCKET = "scenes";

/** 确保 bucket 存在（首次调用时自动创建） */
const readyBuckets = new Set<string>();
async function ensureBucket(bucket: string) {
  if (readyBuckets.has(bucket)) return;
  const { data } = await supabase.storage.getBucket(bucket);
  if (!data) {
    await supabase.storage.createBucket(bucket, { public: true });
    logger.info("Created storage bucket", { bucket });
  }
  readyBuckets.add(bucket);
}

/**
 * 下载临时 URL 的图片并上传到 Supabase Storage
 * 返回永久公开 URL
 */
export async function uploadPortrait(
  userId: string,
  tempImageUrl: string
): Promise<string> {
  await ensureBucket(PORTRAIT_BUCKET);

  // 下载图片
  const res = await fetch(tempImageUrl);
  if (!res.ok) throw new Error(`Failed to download image: ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());

  const filePath = `${userId}.png`;

  // 上传（覆盖旧文件）
  const { error } = await supabase.storage
    .from(PORTRAIT_BUCKET)
    .upload(filePath, buffer, {
      contentType: "image/png",
      upsert: true,
    });

  if (error) throw new Error(`Upload failed: ${error.message}`);

  // 获取永久公开 URL
  const { data } = supabase.storage.from(PORTRAIT_BUCKET).getPublicUrl(filePath);
  logger.info("Portrait uploaded", { userId, url: data.publicUrl });
  return data.publicUrl;
}

/**
 * 上传场景合成图到 Supabase Storage
 * @param storageKey 唯一标识（如 taskId、roomId）
 * @param scene 场景类型
 * @param buffer 图片二进制
 * @param contentType MIME 类型
 * @returns 永久公开 URL
 */
export async function uploadSceneImage(
  storageKey: string,
  scene: string,
  buffer: Buffer,
  contentType: string = "image/jpeg"
): Promise<string> {
  await ensureBucket(SCENE_BUCKET);

  const ext = contentType.includes("png") ? "png" : "jpg";
  const filePath = `${storageKey}_${scene.replace(".", "-")}.${ext}`;

  const { error } = await supabase.storage
    .from(SCENE_BUCKET)
    .upload(filePath, buffer, {
      contentType,
      upsert: true,
    });

  if (error) throw new Error(`Scene upload failed: ${error.message}`);

  const { data } = supabase.storage.from(SCENE_BUCKET).getPublicUrl(filePath);
  logger.info("Scene image uploaded", { storageKey, scene, url: data.publicUrl });
  return data.publicUrl;
}
