#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."

app="build/AppleMusicDaily.app"
output="$PWD/dist/AppleMusicDaily.dmg"

if [[ ! -d "$app" || ! -f "$app/Contents/Info.plist" || ! -x "$app/Contents/MacOS/AppleMusicDaily" ]]; then
    printf '打包失败：没有找到完整的 %s，请先运行 bash scripts/build.sh。\n' "$app" >&2
    exit 1
fi

# Package the existing build without rebuilding or changing its signature.
codesign --verify --strict "$app"
mkdir -p dist
package_tmp=$(mktemp -d "$PWD/dist/.dmg-XXXXXX")
mounted=false
cleanup() {
    if [[ "$mounted" == true ]]; then
        if ! hdiutil detach "$package_tmp/mount"; then
            printf '临时镜像仍挂载在 %s，请手动推出后清理。\n' "$package_tmp/mount" >&2
            return
        fi
    fi
    rm -rf -- "$package_tmp"
}
trap cleanup EXIT
trap 'printf "打包失败：请检查上方错误信息。\n" >&2' ERR

mkdir -p "$package_tmp/staging"
ditto "$app" "$package_tmp/staging/AppleMusicDaily.app"
ln -s /Applications "$package_tmp/staging/Applications"
codesign --verify --strict "$package_tmp/staging/AppleMusicDaily.app"
mkdir -p "$package_tmp/staging/.background" "$package_tmp/swift-cache"
xcrun swift -module-cache-path "$package_tmp/swift-cache" scripts/dmg/background.swift \
    "$package_tmp/staging/.background/background.png"

printf '正在制作安装布局（可能需要允许终端控制 Finder）…\n'
hdiutil create -volname "Apple Music Daily" -srcfolder "$package_tmp/staging" \
    -fs HFS+ -format UDRW "$package_tmp/editable.dmg"
mkdir -p "$package_tmp/mount"
hdiutil attach -readwrite -noverify -noautoopen -mountpoint "$package_tmp/mount" "$package_tmp/editable.dmg"
mounted=true
osascript scripts/dmg/layout.applescript "$package_tmp/mount"
for attempt in {1..10}; do
    [[ -f "$package_tmp/mount/.DS_Store" ]] && break
    sleep 1
done
if [[ ! -f "$package_tmp/mount/.DS_Store" ]]; then
    printf '打包失败：Finder 未保存安装布局。\n' >&2
    exit 1
fi
hdiutil detach "$package_tmp/mount"
mounted=false
hdiutil convert "$package_tmp/editable.dmg" -format UDZO -o "$package_tmp/AppleMusicDaily.dmg"
hdiutil verify "$package_tmp/AppleMusicDaily.dmg"

# Keep the previous DMG until its replacement has passed verification.
mv -f "$package_tmp/AppleMusicDaily.dmg" "$output"
printf '\n打包成功，DMG 校验通过。\n文件路径：%s\n安装方式：打开 DMG，将 AppleMusicDaily.app 拖到 Applications。\n' "$output"
