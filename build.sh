#!/bin/bash
# Builds Kamurafy.app with swiftc + Command Line Tools (no Xcode required).
# KamurafyKit is compiled as an embedded framework; the app links against it.
set -euo pipefail
cd "$(dirname "$0")"
ROOT="$(pwd)"; BUILD="$ROOT/build"; APP="$BUILD/Kamurafy.app"; FWK="$BUILD/KamurafyKit.framework"
ARCH="$(uname -m)"; TARGET="${ARCH}-apple-macosx15.0"; SDK="$(xcrun --sdk macosx --show-sdk-path)"

echo "==> clean"; rm -rf "$BUILD"; mkdir -p "$BUILD"

echo "==> KamurafyKit.framework"
A="$FWK/Versions/A"; mkdir -p "$A/Resources" "$A/Modules/KamurafyKit.swiftmodule"
swiftc $(find KamurafyKit -name '*.swift') -sdk "$SDK" -target "$TARGET" \
  -module-name KamurafyKit -emit-library -emit-module \
  -emit-module-path "$A/Modules/KamurafyKit.swiftmodule/${ARCH}-apple-macos.swiftmodule" -O \
  -Xlinker -install_name -Xlinker "@rpath/KamurafyKit.framework/Versions/A/KamurafyKit" \
  -o "$A/KamurafyKit"
cat > "$A/Resources/Info.plist" <<P
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleIdentifier</key><string>dev.gabrielkamura.KamurafyKit</string>
<key>CFBundleName</key><string>KamurafyKit</string>
<key>CFBundlePackageType</key><string>FMWK</string>
<key>CFBundleShortVersionString</key><string>1.0.0</string>
<key>CFBundleVersion</key><string>1</string>
</dict></plist>
P
ln -sf A "$FWK/Versions/Current"
ln -sf Versions/Current/KamurafyKit "$FWK/KamurafyKit"
ln -sf Versions/Current/Resources "$FWK/Resources"
ln -sf Versions/Current/Modules "$FWK/Modules"

echo "==> bundle"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Frameworks" "$APP/Contents/Resources"
cp -R "$FWK" "$APP/Contents/Frameworks/"

echo "==> icon"
ICONSET="$BUILD/AppIcon.iconset"; mkdir -p "$ICONSET"; SRC="Kamurafy/Resources/AppIcon"
if [ -f "$SRC/icon_1024.png" ]; then
  cp "$SRC/icon_16.png" "$ICONSET/icon_16x16.png"
  cp "$SRC/icon_32.png" "$ICONSET/icon_16x16@2x.png"
  cp "$SRC/icon_32.png" "$ICONSET/icon_32x32.png"
  cp "$SRC/icon_64.png" "$ICONSET/icon_32x32@2x.png"
  cp "$SRC/icon_128.png" "$ICONSET/icon_128x128.png"
  cp "$SRC/icon_256.png" "$ICONSET/icon_128x128@2x.png"
  cp "$SRC/icon_256.png" "$ICONSET/icon_256x256.png"
  cp "$SRC/icon_512.png" "$ICONSET/icon_256x256@2x.png"
  cp "$SRC/icon_512.png" "$ICONSET/icon_512x512.png"
  cp "$SRC/icon_1024.png" "$ICONSET/icon_512x512@2x.png"
  iconutil -c icns "$ICONSET" -o "$APP/Contents/Resources/AppIcon.icns"
fi

echo "==> localizations"
cp -R Kamurafy/Resources/*.lproj "$APP/Contents/Resources/" 2>/dev/null || true

echo "==> app binary"
swiftc $(find Kamurafy -name '*.swift') -sdk "$SDK" -target "$TARGET" \
  -module-name Kamurafy -F "$APP/Contents/Frameworks" -framework KamurafyKit -O \
  -Xlinker -rpath -Xlinker "@executable_path/../Frameworks" \
  -o "$APP/Contents/MacOS/Kamurafy"

echo "==> Info.plist"
cat > "$APP/Contents/Info.plist" <<P
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleDevelopmentRegion</key><string>en</string>
<key>CFBundleLocalizations</key><array><string>ar</string><string>cs</string><string>de</string><string>el</string><string>en</string><string>es</string><string>fa</string><string>fr</string><string>he</string><string>hi</string><string>id</string><string>it</string><string>ja</string><string>ko</string><string>ms</string><string>nl</string><string>pl</string><string>pt-BR</string><string>pt-PT</string><string>ro</string><string>ru</string><string>sv</string><string>th</string><string>tr</string><string>uk</string><string>vi</string><string>zh-Hans</string><string>zh-Hant</string></array>
<key>CFBundleDisplayName</key><string>Kamurafy</string>
<key>CFBundleExecutable</key><string>Kamurafy</string>
<key>CFBundleIconFile</key><string>AppIcon</string>
<key>CFBundleIdentifier</key><string>dev.gabrielkamura.Kamurafy</string>
<key>CFBundleInfoDictionaryVersion</key><string>6.0</string>
<key>CFBundleName</key><string>Kamurafy</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleShortVersionString</key><string>1.0.0</string>
<key>CFBundleVersion</key><string>1</string>
<key>LSApplicationCategoryType</key><string>public.app-category.utilities</string>
<key>LSMinimumSystemVersion</key><string>15.0</string>
<key>NSAppleEventsUsageDescription</key><string>Kamurafy uses this to run the memory optimization with your permission.</string>
<key>NSHighResolutionCapable</key><true/>
</dict></plist>
P
echo "APPL????" > "$APP/Contents/PkgInfo"

echo "==> strip + sign"
strip -x "$APP/Contents/MacOS/Kamurafy" 2>/dev/null || true
codesign --force --deep --sign - "$APP" 2>/dev/null || true
echo "==> DONE: $APP"
