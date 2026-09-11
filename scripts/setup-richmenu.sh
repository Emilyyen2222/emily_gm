#!/usr/bin/env bash
# 建立並套用 LINE 圖文選單。
#
# 圖文選單無法在官方帳號後台設定成開啟 LIFF，只能走 API，所以放成腳本。
# 換圖或改連結時重跑一次即可（會建立新的選單並設為預設，舊的可另外刪除）。
#
#   ./scripts/setup-richmenu.sh [圖片路徑]
#
# 需要 .env 裡的 NUXT_LINE_CHANNEL_ACCESS_TOKEN 與 NUXT_PUBLIC_LIFF_ID。
set -euo pipefail
cd "$(dirname "$0")/.."

set -a; . ./.env; set +a
IMAGE="${1:-assets/richmenu/richmenu-icons.png}"
LIFF_URL="https://liff.line.me/$NUXT_PUBLIC_LIFF_ID"
AUTH="Authorization: Bearer $NUXT_LINE_CHANNEL_ACCESS_TOKEN"

echo "建立選單…"
ID=$(curl -s -X POST https://api.line.me/v2/bot/richmenu -H "$AUTH" -H 'Content-Type: application/json' -d "{
  \"size\": { \"width\": 2500, \"height\": 843 },
  \"selected\": true,
  \"name\": \"emily-gm-main\",
  \"chatBarText\": \"開啟選單\",
  \"areas\": [
    { \"bounds\": { \"x\": 0,    \"y\": 0, \"width\": 833, \"height\": 843 },
      \"action\": { \"type\": \"uri\", \"label\": \"今天記錄\", \"uri\": \"$LIFF_URL\" } },
    { \"bounds\": { \"x\": 833,  \"y\": 0, \"width\": 834, \"height\": 843 },
      \"action\": { \"type\": \"uri\", \"label\": \"我的紀錄\", \"uri\": \"$LIFF_URL/history\" } },
    { \"bounds\": { \"x\": 1667, \"y\": 0, \"width\": 833, \"height\": 843 },
      \"action\": { \"type\": \"message\", \"label\": \"說明\", \"text\": \"說明\" } }
  ]
}" | sed -n 's/.*"richMenuId":"\([^"]*\)".*/\1/p')
[ -z "$ID" ] && { echo "建立失敗"; exit 1; }
echo "  richMenuId = $ID"

echo "上傳圖片（$IMAGE）…"
curl -s -f -X POST "https://api-data.line.me/v2/bot/richmenu/$ID/content" \
  -H "$AUTH" -H 'Content-Type: image/png' --data-binary "@$IMAGE" > /dev/null

# 這個 POST 沒有 body，不補 Content-Length: 0 的話 LINE 的閘道會回 411
echo "設為預設選單…"
curl -s -f -X POST "https://api.line.me/v2/bot/user/all/richmenu/$ID" \
  -H "$AUTH" -H 'Content-Length: 0' > /dev/null

echo "$ID" > assets/richmenu/.richmenu-id
echo "完成。目前的預設選單："
curl -s https://api.line.me/v2/bot/user/all/richmenu -H "$AUTH"
echo ""
