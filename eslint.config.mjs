import antfu from '@antfu/eslint-config'

export default antfu({
  typescript: true,
  vue: true,
  // Tests use node:test, not Vitest.
  test: false,
  rules: {
    // Keep the existing install policies; this refactor only adds workspaces.
    'pnpm/yaml-enforce-settings': 'off',
  },
})
