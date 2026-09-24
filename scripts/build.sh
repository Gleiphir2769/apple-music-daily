#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
app="build/MusicKitProbe.app"
mkdir -p "$app/Contents/MacOS" "$app/Contents/Resources" build/swift-cache
cp src/Info.plist "$app/Contents/Info.plist"
cp src/Resources/chat-adapter.js "$app/Contents/Resources/chat-adapter.js"
xcrun swiftc -parse-as-library -target arm64-apple-macosx14.0 -module-cache-path build/swift-cache -framework SwiftUI -framework MusicKit -framework WebKit src/Probe.swift src/WebExecutor.swift src/DailyRecommendation.swift -o "$app/Contents/MacOS/MusicKitProbe"
codesign --force --sign - "$app"
