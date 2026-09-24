#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
# Always rebuild generated resources, the app bundle and the Swift module cache.
rm -rf -- build
app="build/AppleMusicDaily.app"
mkdir -p "$app/Contents/MacOS" "$app/Contents/Resources" build/swift-cache
cp src/Info.plist "$app/Contents/Info.plist"
cp src/Resources/chat-adapter.js "$app/Contents/Resources/chat-adapter.js"
bash scripts/build-icon.sh
cp build/AppIcon.icns "$app/Contents/Resources/AppIcon.icns"
xcrun swiftc -parse-as-library -target arm64-apple-macosx14.0 -module-cache-path build/swift-cache -framework SwiftUI -framework MusicKit -framework WebKit src/AppleMusicDaily.swift src/WebExecutor.swift src/DailyRecommendation.swift -o "$app/Contents/MacOS/AppleMusicDaily"
codesign --force --sign - "$app"
codesign --verify --strict "$app"
printf '\n编译成功，签名验证通过。\n应用路径：%s/%s\n启动命令：open "%s/%s"\n' "$PWD" "$app" "$PWD" "$app"
