#!/bin/bash
# Notariza e grampeia o .dmg (precisa de conta Apple Developer).
# Uma vez só, guarde as credenciais no Keychain:
#   xcrun notarytool store-credentials kamurafy --apple-id <seu-email> --team-id <TEAMID>
# Depois:
#   ASSINATURA="Developer ID Application: Nome (TEAMID)" tools/dmg.sh
#   tools/notarizar.sh build/Kamurafy-<versão>.dmg
set -euo pipefail
DMG="${1:?uso: tools/notarizar.sh <arquivo.dmg>}"
PERFIL="${PERFIL:-kamurafy}"
xcrun notarytool submit "$DMG" --keychain-profile "$PERFIL" --wait
xcrun stapler staple "$DMG"
spctl --assess --type open --context context:primary-signature -v "$DMG" || true
echo "notarizado: $DMG"
