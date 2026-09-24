#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
iconset="build/AppIcon.iconset"
mkdir -p "$iconset"
for size in 16 32 128 256 512; do
    sips -z "$size" "$size" src/Resources/AppIcon.png --out "$iconset/icon_${size}x${size}.png" >/dev/null
    doubled=$((size * 2))
    sips -z "$doubled" "$doubled" src/Resources/AppIcon.png --out "$iconset/icon_${size}x${size}@2x.png" >/dev/null
done
if ! iconutil -c icns "$iconset" -o build/AppIcon.icns; then
    # Package the generated PNG sizes directly if iconutil rejects the iconset.
    # This preserves the source artwork and uses the PNG-backed ICNS entries.
    python3 - <<'ICONPY'
from pathlib import Path
import struct
root = Path('build/AppIcon.iconset')
entries = [('icp4', 'icon_16x16.png'), ('icp5', 'icon_32x32.png'),
           ('icp6', 'icon_32x32@2x.png'), ('ic07', 'icon_128x128.png'),
           ('ic08', 'icon_256x256.png'), ('ic09', 'icon_512x512.png'),
           ('ic10', 'icon_512x512@2x.png'), ('ic11', 'icon_16x16@2x.png'),
           ('ic12', 'icon_32x32@2x.png'), ('ic13', 'icon_128x128@2x.png'),
           ('ic14', 'icon_256x256@2x.png')]
chunks = []
for kind, filename in entries:
    data = (root / filename).read_bytes()
    if not data.startswith(b'\x89PNG\r\n\x1a\n'):
        raise ValueError(f'Not PNG: {filename}')
    chunks.append(kind.encode('ascii') + struct.pack('>I', len(data) + 8) + data)
body = b''.join(chunks)
Path('build/AppIcon.icns').write_bytes(b'icns' + struct.pack('>I', len(body) + 8) + body)
ICONPY
fi
