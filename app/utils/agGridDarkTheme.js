import { themeQuartz } from 'ag-grid-community'

/**
 * AG Grid Community theme params aligned with Dark Theme (Sintrex Dark).
 */
export const agGridDarkTheme = themeQuartz.withParams({
  backgroundColor: '#1e232b',
  foregroundColor: '#e8eef4',
  borderColor: '#2f3742',
  chromeBackgroundColor: '#1a1e25',
  headerBackgroundColor: '#1a1e25',
  headerTextColor: '#9aa7b5',
  oddRowBackgroundColor: '#1a1e25',
  rowHoverColor: 'rgba(0, 194, 199, 0.08)',
  selectedRowBackgroundColor: 'rgba(0, 194, 199, 0.16)',
  accentColor: '#00c2c7',
  rangeSelectionBackgroundColor: 'rgba(0, 194, 199, 0.12)',
  inputBackgroundColor: '#14171c',
  inputBorderColor: '#2f3742',
  inputFocusBorderColor: '#00c2c7',
  menuBackgroundColor: '#1e232b',
  menuBorderColor: '#2f3742',
  tooltipBackgroundColor: '#1a1e25',
  tooltipTextColor: '#e8eef4',
  fontFamily: "'DM Sans', system-ui, sans-serif",
  // Subtle column separators (default Quartz often hides these).
  columnBorder: true,
  rowBorder: true,
  headerColumnBorder: true,
})
