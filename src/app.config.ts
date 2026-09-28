export default defineAppConfig({
  ui: {
    colors: {
      primary: 'indigo',
      neutral: 'slate',
      success: 'emerald',
      warning: 'amber',
      error: 'rose',
    },
    button: { slots: { base: 'bank-button', trailingIcon: 'bank-button-arrow' } },
  },
})
