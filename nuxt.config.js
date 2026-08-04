import { DarkTheme } from './app/themes/darkTheme.js'

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },

  modules: [
    '@nuxtjs/tailwindcss',
    '@pinia/nuxt',
    '@openvue/nuxt-module',
    '@vee-validate/nuxt',
  ],

  tailwindcss: {
    cssPath: '~/assets/css/main.css',
  },

  // OpenVue keeps the `primevue` Nuxt config key for API compatibility.
  // Dark Theme (Sintrex Dark) is the default OpenVue preset.
  primevue: {
    usePrimeVue: true,
    options: {
      theme: {
        preset: DarkTheme,
        options: {
          darkModeSelector: '[data-theme="dark"]',
        },
      },
    },
  },

  veeValidate: {
    autoImports: true,
    componentNames: {
      Form: 'VeeForm',
      Field: 'VeeField',
      FieldArray: 'VeeFieldArray',
      ErrorMessage: 'VeeErrorMessage',
    },
  },

  build: {
    transpile: ['ag-grid-vue3', 'ag-grid-community', 'vue-data-ui'],
  },

  runtimeConfig: {
    // Prefer new secret keys (sb_secret_...). Legacy service_role kept as fallback.
    supabaseSecretKey:
      process.env.SUPABASE_SECRET_KEY
      || process.env.SUPABASE_SERVICE_ROLE_KEY
      || '',
    // @deprecated alias — use supabaseSecretKey
    supabaseServiceRoleKey:
      process.env.SUPABASE_SECRET_KEY
      || process.env.SUPABASE_SERVICE_ROLE_KEY
      || '',
    // AES key material for connection_secrets (any long random string)
    connectorSecretsKey: process.env.CONNECTOR_SECRETS_KEY || '',
    public: {
      supabaseUrl: process.env.NUXT_PUBLIC_SUPABASE_URL || '',
      // Prefer publishable keys (sb_publishable_...). Legacy anon kept as fallback.
      supabasePublishableKey:
        process.env.NUXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
        || process.env.NUXT_PUBLIC_SUPABASE_ANON_KEY
        || '',
      // @deprecated alias — use supabasePublishableKey
      supabaseAnonKey:
        process.env.NUXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
        || process.env.NUXT_PUBLIC_SUPABASE_ANON_KEY
        || '',
    },
  },

  app: {
    head: {
      htmlAttrs: {
        lang: 'en',
        'data-theme': 'dark',
      },
      title: 'Zorro',
      meta: [
        {
          name: 'description',
          content: 'A clean Nuxt 3 JavaScript starter with Tailwind CSS and Dark Theme.',
        },
        {
          name: 'color-scheme',
          content: 'dark',
        },
      ],
      link: [
        { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        {
          rel: 'preconnect',
          href: 'https://fonts.gstatic.com',
          crossorigin: '',
        },
        {
          rel: 'stylesheet',
          href: 'https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;1,9..40,400&family=IBM+Plex+Mono:wght@400;500;600&display=swap',
        },
      ],
    },
  },
})
