// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },

  // LIFF SDK 依賴瀏覽器環境，且全站都在 LINE 登入後才有意義，因此關閉頁面 SSR。
  // 注意：這只關掉「頁面」的伺服器渲染，server/api/** 的 Nitro routes 仍正常運作。
  ssr: false,

  modules: ['@nuxtjs/tailwindcss'],

  runtimeConfig: {
    // 以下僅存在於 server 端，不會進入瀏覽器 bundle
    lineLoginChannelId: '',
    lineChannelAccessToken: '',
    lineChannelSecret: '',
    supabaseUrl: '',
    supabaseServiceRoleKey: '',
    cronSecret: '',
    public: {
      // 只有 public 這層會被打包進前端
      liffId: '',
    },
  },

  app: {
    head: {
      title: '每日狀態記錄',
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
        { name: 'format-detection', content: 'telephone=no' },
      ],
    },
  },
})
