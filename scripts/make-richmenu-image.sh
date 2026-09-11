#!/usr/bin/env bash
# 產生圖文選單圖片。
# 用 Chrome headless 渲染 HTML 再截圖，而不是用繪圖函式庫 ——
# 這樣中文可以直接用 app 同一套 Huninn 字體，不必處理字型檔。
set -euo pipefail
cd "$(dirname "$0")/.."
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
SRC="${1:-assets/richmenu/richmenu-icons.html}"
OUT="${2:-assets/richmenu/richmenu-icons.png}"
"$CHROME" --headless --disable-gpu --hide-scrollbars --force-device-scale-factor=1 \
  --window-size=2500,843 --default-background-color=FFF8EF \
  --screenshot="$OUT" "file://$PWD/$SRC"
echo "已產生 $OUT"
