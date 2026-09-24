#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p MusicKitProbe.app/Contents/MacOS ../../work/swift-cache
cp Info.plist MusicKitProbe.app/Contents/Info.plist
mkdir -p MusicKitProbe.app/Contents/Resources
cp Resources/chat-adapter.js MusicKitProbe.app/Contents/Resources/chat-adapter.js
xcrun swiftc -parse-as-library -target arm64-apple-macosx14.0 -module-cache-path ../../work/swift-cache -framework SwiftUI -framework MusicKit -framework WebKit Probe.swift WebExecutor.swift DailyRecommendation.swift -o MusicKitProbe.app/Contents/MacOS/MusicKitProbe
codesign --force --sign - MusicKitProbe.app
