import Aura from '@openvue/themes/aura'
import { definePreset, palette } from '@openvue/themes'

/**
 * Dark Theme (Sintrex Dark) — OpenVue / Aura preset.
 * Charcoal surfaces + cyan teal primary (#00c2c7).
 */
const primary = palette('#00c2c7')

export const DarkTheme = definePreset(Aura, {
  semantic: {
    primary,
    colorScheme: {
      light: {
        // Keep light scheme aligned so unstyled paths still look dark by default.
        primary: {
          color: '{primary.500}',
          contrastColor: '#041416',
          hoverColor: '{primary.400}',
          activeColor: '{primary.600}',
        },
        surface: {
          0: '#e8eef4',
          50: '#dce4ec',
          100: '#9aa7b5',
          200: '#7b8794',
          300: '#6b7785',
          400: '#3a4552',
          500: '#2f3742',
          600: '#273039',
          700: '#1e232b',
          800: '#1a1e25',
          900: '#171b21',
          950: '#14171c',
        },
      },
      dark: {
        primary: {
          color: '{primary.500}',
          contrastColor: '#041416',
          hoverColor: '{primary.400}',
          activeColor: '{primary.600}',
        },
        surface: {
          0: '#e8eef4',
          50: '#dce4ec',
          100: '#9aa7b5',
          200: '#7b8794',
          300: '#6b7785',
          400: '#3a4552',
          500: '#2f3742',
          600: '#273039',
          700: '#1e232b',
          800: '#1a1e25',
          900: '#171b21',
          950: '#14171c',
        },
      },
    },
  },
})

export default DarkTheme
