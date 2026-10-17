module.exports = {
  apps: [{
    name: 'pi-simple-api',
    cwd: '/home/esteban/prod/pi-simple-web-runtime/current',
    script: '/home/esteban/prod/pi-simple-web-runtime/current/.output/server/index.mjs',
    interpreter: '/home/esteban/.nvm/versions/node/v24.21.0/bin/node',
    exec_mode: 'fork',
    instances: 1,
    env: {
      NODE_ENV: 'production',
      HOST: '127.0.0.1',
      PORT: '4001',
      NUXT_ALLOWED_ORIGINS: 'https://barbabot.soubiran.dev',
    },
  }],
}
