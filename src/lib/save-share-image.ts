/**
 * 将 DOM 元素截图并触发下载。
 * 在截图前把所有 <img> 的 src 转为 data URL，避免跨域 CORS 问题。
 */
export async function saveShareImage(
  el: HTMLElement,
  fileName: string
): Promise<void> {
  const { toPng } = await import("html-to-image");

  // 1. 收集所有图片，将外部 URL 转成 data URL
  const imgs = el.querySelectorAll("img");
  const origSrcs: string[] = [];
  await Promise.all(
    Array.from(imgs).map(async (img, i) => {
      origSrcs[i] = img.src;
      if (!img.src || img.src.startsWith("data:")) return;
      try {
        const res = await fetch(img.src);
        const blob = await res.blob();
        img.src = await blobToDataUrl(blob);
      } catch {
        // 转换失败就保留原 src，html-to-image 会尝试处理
      }
    })
  );

  try {
    // 2. 截图
    const dataUrl = await toPng(el, { pixelRatio: 2, backgroundColor: "#ffffff" });

    // 3. 触发下载
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  } finally {
    // 4. 恢复原始 src
    imgs.forEach((img, i) => {
      if (origSrcs[i]) img.src = origSrcs[i];
    });
  }
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
