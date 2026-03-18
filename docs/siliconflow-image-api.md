# SiliconFlow 图片生成 API

> 官方文档: https://docs.siliconflow.cn/cn/api-reference/images/images-generations
> 生图模型指南: https://docs.siliconflow.cn/cn/userguide/capabilities/images

## 基本信息

- **请求方法**: `POST`
- **URL**: `https://api.siliconflow.cn/v1/images/generations`
- **认证**: `Authorization: Bearer <SILICONFLOW_API_KEY>`
- **Content-Type**: `application/json`
- **图片 URL 有效期**: 1 小时，需及时下载保存

## 本项目使用的模型

- **模型名**: `Kwai-Kolors/Kolors` (快手可灵 Kolors)
- **用途**: 绘画任务中根据分身生成的英文 prompt 生图

## 请求参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `model` | string | ✅ | 模型名称，如 `Kwai-Kolors/Kolors` |
| `prompt` | string | ✅ | 图片描述文本（建议英文，效果更好） |
| `image_size` | string | 否 | 图片尺寸，如 `1024x1024`、`1024x768`、`768x1024` 等，可自定义分辨率 |
| `batch_size` | integer | 否 | 一次生成图片数量，默认 `1`，最大 `4` |
| `num_inference_steps` | integer | 否 | 生成步长，步数越多质量越高但越慢 |
| `negative_prompt` | string | 否 | 不希望出现在图片中的元素描述 |
| `seed` | integer | 否 | 随机种子，固定值可复现相同图片 |
| `guidance_scale` | number | 否 | 引导系数，控制 prompt 的影响强度 |

## 响应格式

```json
{
  "images": [
    {
      "url": "https://..."
    }
  ],
  "timings": {
    "inference": 1.234
  },
  "seed": 123456789
}
```

- `images[].url` — 生成图片的临时 URL（**1 小时后过期**）
- `timings.inference` — 推理耗时（秒）
- `seed` — 实际使用的随机种子

## curl 示例

```bash
curl --request POST \
  --url https://api.siliconflow.cn/v1/images/generations \
  --header 'Authorization: Bearer $SILICONFLOW_API_KEY' \
  --header 'Content-Type: application/json' \
  --data '{
    "model": "Kwai-Kolors/Kolors",
    "prompt": "an island near sea, with seagulls, moon shining over the sea",
    "image_size": "1024x768",
    "batch_size": 1,
    "num_inference_steps": 20,
    "seed": 4999999999
  }'
```

## OpenAI SDK 兼容调用

SiliconFlow 兼容 OpenAI SDK，可以直接用 `openai` 包调用：

```python
from openai import OpenAI

client = OpenAI(api_key="your-api-key", base_url="https://api.siliconflow.cn/v1")

response = client.images.generate(
    model="Kwai-Kolors/Kolors",
    prompt="a cat",
    size="1024x1024",
    n=1,
    extra_body={
        "step": 20
    }
)

print(response)
```

> 注意: SDK 使用 `size` 参数（如 `"1024x1024"`），REST API 使用 `image_size`。

## 错误码

| HTTP 状态码 | 说明 |
|------------|------|
| 400 | 参数不正确（如模型不存在） |
| 401 | API Key 未设置或无效 |
| 403 | 余额不足或需要实名认证 |
| 429 | 触发速率限制 (Rate Limits) |
| 500 | 服务内部错误 |
| 503/504 | 服务高负载，稍后重试 |

## 环境变量 (本项目)

```env
SILICONFLOW_API_KEY=sk-xxx        # API Key，在 https://cloud.siliconflow.cn/account/ak 获取
SILICONFLOW_IMAGE_URL=https://api.siliconflow.cn/v1/images/generations
SILICONFLOW_IMAGE_MODEL=Kwai-Kolors/Kolors
```

## 注意事项

- 图片 URL 仅 **1 小时** 有效，如需持久化须下载后上传到自有存储
- Prompt 建议使用**英文**，效果更好
- `batch_size` 最大为 4，可一次生成多张图片
- 不同模型支持的参数可能有差异，以模型广场实际展示为准
- 模型列表: https://cloud.siliconflow.cn/sft-siliconflow/models?types=to-image
