# 小书哲学名言弹窗 · 前端交付说明

## 设计方向

- 形态：不规则“手绘纸片云”，避免标准圆角矩形。
- 构图：小书位于右下，约占组件总高度的 30%；气泡位于左上，宽约为小书的 2.7 倍。
- 配色：暖白底、黑色手绘描边；深红色与书本呼应；黄色只用于一处星光点缀。
- 信息层级：不设置标题，直接展示名言；作者缩小并右对齐，让弹窗更轻、更像小书自然冒出的想法。
- 建议组件尺寸：桌面端常规态约 `420 × 260 px`；小书 `120–132 px`；气泡 `330–360 × 150–180 px`。
- 气泡轮廓建议做成 SVG 或九宫格拉伸图片，避免纯 CSS `border-radius` 带来的机械感。

## 字体选择

主字体：**小赖字体 / Xiaolai Regular**。

- 官方项目：https://github.com/lxgw/kose-font
- 版本：v3.126
- 授权：SIL Open Font License 1.1。
- 当前目录包含完整 `TTF`、转换后的完整 `WOFF2`，以及必须随应用分发的 `OFL.txt`。

### 客户端格式

- Electron、Tauri、WebView：优先使用 `Xiaolai-Regular.woff2`，体积较小且渲染稳定；保留 TTF 作为兼容回退。
- macOS / Windows 原生客户端：直接随包分发并注册 `Xiaolai-Regular.ttf`，不要依赖用户系统是否安装该字体。
- 当前 WOFF2 是完整字库，适合名言内容动态变化且不可预知的场景。若名言库固定，可按语料子集化，显著减小安装包。

```css
@font-face {
  font-family: "Xiaolai";
  src:
    url("./fonts/Xiaolai-Regular.woff2") format("woff2"),
    url("./fonts/Xiaolai-Regular.ttf") format("truetype");
  font-style: normal;
  font-weight: 400;
  font-display: block;
}

.pet-quote {
  font-family: "Xiaolai", "LXGW WenKai", "PingFang SC",
    "Microsoft YaHei", sans-serif;
  font-weight: 400;
}
```

建议在显示弹窗前等待 `document.fonts.ready`，避免先显示系统字体、随后跳成手写字体。

## 字号建议

- 小标题：16 px，深红色 `#A62D2B`。
- 名言：25–28 px，行高 1.45，正文色 `#292929`。
- 作者：17–18 px，正文色 75% 不透明度。
- 弹窗内边距：上下 22–26 px、左右 28–32 px。

## 交互建议

- 主动弹出：停留 6–8 秒；鼠标悬停时暂停消失。
- 被动触发：用户点击小书后保持显示，点击空白处收起。
- 动画：气泡用 180–240 ms 的轻微上浮和淡入；小书不需要同步做大动作，避免抢占注意力。
- 一次只展示一条名言，正文建议不超过 42 个汉字、最多 3 行。
