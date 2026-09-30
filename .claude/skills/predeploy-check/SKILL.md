---
name: predeploy-check
description: 這個專案每次 commit 與 push 之前、之後都要做的檢查：型別檢查、LINE 卡片格式驗證、AI 提示詞測試、push 後確認正式站 emily-gm.vercel.app 部署完成，並誠實回報哪些沒辦法實測。只要準備把改動推上線就使用。
---

# 上線前檢查

## push 之前

1. **型別檢查**：`pnpm exec nuxi typecheck`
   - 已知的舊錯誤，不是這次造成的：`app/components/TempField.vue(17)` 與 `server/utils/textReply.ts` 裡 `.map(rowToRecord)` 那一行。其他錯誤都要修掉。
2. **有改到 LINE 卡片（Flex Message）**：用 LINE 的驗證 API 檢查格式，免費、不會送出、不用推播額度：
   ```
   POST https://api.line.me/v2/bot/message/validate/push
   Authorization: Bearer <.env 的 NUXT_LINE_CHANNEL_ACCESS_TOKEN>
   body: { "messages": [卡片...] }
   ```
   - 使用者自己透過 `liff.sendMessages()` 送出的卡片（分享卡片）**不能有任何按鈕或 action**，LINE 會整則拒收。
   - 一次推播最多 5 則訊息。
3. **有改到 AI 提示詞**：用**虛構的紀錄**呼叫實際的提示詞測幾次，不要用真實的紀錄。同一個問題多跑幾次，Haiku 的結果會變。
4. **有動到送出訊息的功能**：先完成 privacy-check。
5. **有動到資料庫結構**：先完成 db-migration，migration 沒在正式資料庫跑完之前不能 push。
6. **有新的介面文字**：必須是 妍 確認過的。

## commit 與 push

- commit 訊息用繁體中文，格式 `feat:`／`fix:`／`chore:` 加簡短說明，內文寫為什麼。結尾加上系統指定的 Co-Authored-By。
- push 前要有 妍 的同意（她說過「推上去」「直接推」才算）。

## push 之後：確認部署完成

- 正式站是 **https://emily-gm.vercel.app**。`emily-liff.vercel.app` 是舊文件裡的範例網址，**不是**正式站。不確定時，用 LINE 的 `GET https://api.line.me/v2/bot/channel/webhook/endpoint` 查 webhook 網址。
- 判斷方法：打一個**這次新增的 API 路徑**，從 404 變成 401（需要登入）或 200 就代表部署好了。每 10 秒查一次，通常 1～3 分鐘。
- 沒有新增 API 時，先確認既有路徑（例如 `/api/habits` 回 401）代表站是活的，再等 2 分鐘左右。
- 排程時間改動（`vercel.json`）也要部署完才會生效；Hobby 方案每個排程一天一次，只保證在指定的那一個小時內執行。

## 回報

- 做了什麼、測了什麼、結果如何。
- **沒辦法實測的要講清楚**：LIFF 頁面需要從 LINE 登入，我無法實際點；請 妍 在手機上試，並列出要測的步驟。
- 需要推播預覽時，只能傳到 妍 自己的一對一聊天，而且會用掉 1 則推播額度，要先問。
