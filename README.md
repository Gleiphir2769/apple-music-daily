# Apple Music Daily

macOS 每日音乐发现原型：读取 Apple Music 资料库中的近期收藏，生成推荐请求，通过内嵌网页使用 ChatGPT 与 Apple Music，并展示推荐卡片。

## 目录

- `src/`：SwiftUI 应用源码、Info.plist 和网页适配器资源。
- `scripts/`：构建脚本与离线 Python 原型；`archive/` 保留历史修改脚本，正常构建无需执行。
- `tests/`：网页适配器 Mock DOM 测试及独立的请求格式验证脚本（包含逻辑副本，不替代集成测试）。
- `examples/`：候选歌曲示例；中国区可用性尚未验证。
- `docs/`：详细使用说明。
- `build/`：本地构建产物和编译缓存，由构建命令生成，不提交。
- `outputs/`：本地导出数据和生成的推荐结果，不提交。

## 构建与使用

需要 Apple Silicon Mac、macOS 14 或更新版本，以及 Xcode / Swift 工具链。

```bash
bash scripts/build.sh
open build/MusicKitProbe.app
```

首次使用在应用内完成音乐资料库授权、网页登录及 Apple Music 连接，然后选择歌曲范围并点击“一键推荐”。具体行为和限制见 [应用说明](docs/usage.md)。

应用仍处于原型阶段，网页自动化依赖页面结构；真实登录会话中的完整流程仍需验证。

## 验证

在仓库根目录运行（JavaScript 测试需要 Node.js）：

```bash
node --check src/Resources/chat-adapter.js
node tests/test-chat-adapter.cjs
```

使用自己的资料库导出验证请求格式：

```bash
mkdir -p build/swift-cache
xcrun swiftc -module-cache-path build/swift-cache tests/test-recommendation.swift -o build/test-recommendation
build/test-recommendation /path/to/recent-songs.json
```

## 离线原型

需要 Python 3.10 或更新版本，无第三方依赖：

```bash
python3 scripts/free_prototype.py /path/to/recent-songs.json \
  --limit 50 --out outputs/daily-music-demo
```

资料库输入为 JSON 数组，每项需要 `id`、`title`、`artist` 和包含时区的 `addedAt`。可通过 `--candidates` 提供候选歌曲文件。

## 许可证

沿用仓库的 [Apache License 2.0](LICENSE)。
