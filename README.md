# Apple Music Daily

macOS 每日音乐发现原型：读取 Apple Music 资料库中的近期收藏，生成推荐请求，通过内嵌网页使用 ChatGPT 与 Apple Music，并展示推荐卡片。

## 目录

- `outputs/musickit-probe/`：SwiftUI 应用源码、网页适配器、构建脚本及详细使用说明。
- `outputs/musickit-probe/free_prototype.py`：离线处理资料库 JSON、生成推荐上下文与预览页面的 Python 原型。
- `outputs/musickit-probe/verified-candidates.json`：候选歌曲示例；中国区可用性尚未验证。
- `work/test-chat-adapter.cjs`：网页适配器的 Mock DOM 回归测试。
- `work/test-recommendation.swift`：独立的请求格式验证脚本，包含请求生成逻辑副本，不替代应用集成测试。
- `work/integrate_daily.py`、`work/fix_executor.py`：历史开发修改脚本，正常构建无需执行。

保留现有目录结构以兼容构建和脚本路径。编译后的 `.app`、Swift 缓存、个人资料库导出及生成的推荐结果保留在本地，由 `.gitignore` 排除。

## 构建与使用

需要 Apple Silicon Mac、macOS 14 或更新版本，以及 Xcode / Swift 工具链。

```bash
bash outputs/musickit-probe/build.sh
open outputs/musickit-probe/MusicKitProbe.app
```

首次使用在应用内完成音乐资料库授权、网页登录及 Apple Music 连接，然后选择歌曲范围并点击“一键推荐”。具体行为和限制见 [应用说明](outputs/musickit-probe/README.md)。

应用仍处于原型阶段，网页自动化依赖页面结构；真实登录会话中的完整流程仍需验证。

## 验证

在仓库根目录运行（JavaScript 测试需要 Node.js）：

```bash
node --check outputs/musickit-probe/Resources/chat-adapter.js
node work/test-chat-adapter.cjs
```

使用自己的资料库导出验证请求格式：

```bash
mkdir -p work/swift-cache
xcrun swiftc -module-cache-path work/swift-cache work/test-recommendation.swift -o work/test-recommendation
work/test-recommendation /path/to/recent-songs.json
```

## 离线原型

需要 Python 3.10 或更新版本，无第三方依赖：

```bash
python3 outputs/musickit-probe/free_prototype.py /path/to/recent-songs.json \
  --limit 50 --out outputs/daily-music-demo
```

资料库输入为 JSON 数组，每项需要 `id`、`title`、`artist` 和包含时区的 `addedAt`。可通过 `--candidates` 提供候选歌曲文件。

## 许可证

沿用仓库的 [Apache License 2.0](LICENSE)。
