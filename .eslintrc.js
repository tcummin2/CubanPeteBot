module.exports = {
  extends: [
    'eslint-config-airbnb-base'
  ],
  rules: {
    'comma-dangle': ['error', 'never'],
    semi: ['error', 'never'],
    'linebreak-style': 'off',
    'max-len': ['error', 140],
    'arrow-parens': ['error', 'as-needed']
  }
}
