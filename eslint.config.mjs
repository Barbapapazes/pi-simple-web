import antfu from '@antfu/eslint-config'

export default antfu({
  typescript: true,
  vue: true,
  // Tests use node:test, not Vitest.
  test: false,
})
