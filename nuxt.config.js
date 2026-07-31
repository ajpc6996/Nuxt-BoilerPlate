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
    transpile: ['ag-grid-vue3', 'ag-grid-community'],
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
          href: 'https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;1,9..40,400&family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&family=IBM+Plex+Mono:wght@400;500;600&display=swap',
        },
      ],
    },
  },
})
