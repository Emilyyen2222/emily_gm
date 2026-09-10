// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },

  // LIFF SDK 依賴瀏覽器環境，且全站都在 LINE 登入後才有意義，因此關閉頁面 SSR。
  // 注意：這只關掉「頁面」的伺服器渲染，server/api/** 的 Nitro routes 仍正常運作。
  ssr: false,

  modules: ['@nuxtjs/tailwindcss'],

  // 用模組的 cssPath 指定入口，而不是塞進 css: []。
  // 後者會讓模組另外再注入一份預設的 Tailwind 檔，變成重複載入。
  tailwindcss: {
    cssPath: '~/assets/css/main.css',
  },

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
        { name: 'theme-color', content: '#FFF8EF' },
      ],
      link: [
        { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
        {
          rel: 'stylesheet',
          href: 'https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap',
        },
        // Huninn（粉圓體）：中文字體，與 SugarTopia 同一套
        { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Huninn&display=swap' },
      ],
    },
  },
})
