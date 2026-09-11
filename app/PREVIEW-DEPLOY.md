# philo-pet 测试版部署与打包

## 1. 在 Render 建一个服务

仓库根目录的 `render.yaml` 会创建一个 Python Web Service。它用同一个域名同时提供网页和 API，因此桌宠和网页版只需配置一个地址。

1. 把仓库推送到 GitHub 或 GitLab。
2. 在 Render 新建 Blueprint，选择该仓库。
3. 在环境变量 `ZAI_API_KEY` 中填入智谱普通 API Key。
4. 部署完成后打开 `https://你的服务.onrender.com/health`，确认返回 `"ok": true`。
5. 再打开服务根地址，确认网页版能正常出现。

当前配置使用 Render 免费实例与临时 SQLite。实例休眠后，首次访问可能需要约一分钟唤醒；重新部署或重启后，测试用户的服务端对话记录可能丢失。这符合小范围测试用途。

## 2. 生成两个安装包

桌面端是一份代码、两个构建产物：

- macOS Universal：同时支持 Apple Silicon 和 Intel。
- Windows x64：支持常见的 64 位 Windows 10/11 电脑。

最方便的做法是在 GitHub 仓库的 **Actions → Build preview installers → Run workflow** 中填入 Render 服务地址。构建完成后，下载两个 Artifacts 发给测试者。

也可以在对应系统本机打包：

```bash
cd app/desktop
npm ci
npm run release:config -- https://你的服务.onrender.com
npm run make:mac   # 需要在 macOS 上运行
npm run make:win   # 需要在 Windows 上运行
```

安装包位于 `app/desktop/out/make/`。没有 Apple Developer ID 时仍可给测试者试用，但 macOS 第一次启动需要按测试说明手动放行。

## 3. 发给测试者

把对应安装包和 `app/BETA-TESTER.md` 一起发送。正式发布前再补签名、公证、自动更新、正式鉴权、持久数据库和更完整的限流。
