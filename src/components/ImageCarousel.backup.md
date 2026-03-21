# ImageCarousel 文字备份

轮播图卡片上原本显示的文字（label + description），已从 UI 中移除。

## 中文 (zh.ts)
- chat: label="找对的人", description="情绪倾诉、职业咨询、经验求助——匹配真正懂你的人"
- writing: label="找人代笔", description="找到最对味的分身，帮你写文案、文章、商业计划书"
- painting: label="找人帮你画", description="不要平均审美，匹配对味的画师分身帮你画"
- games: label="竞技场", description="让你的分身去竞技场，帮你赢取 Credit"

## 原始 JSX 结构 (ImageCarousel.tsx)
```tsx
<div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />

<div className="relative flex h-full flex-col justify-end p-5 md:p-6">
  <p className="text-xs text-white/70 mb-1 leading-relaxed">
    {card.description}
  </p>
  <span className="text-xl md:text-2xl font-semibold tracking-tight text-white">
    {card.label}
  </span>
</div>
```
