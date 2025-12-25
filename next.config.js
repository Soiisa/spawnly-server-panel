// next.config.js
const { i18n } = require('./next-i18next.config');

module.exports = {
  i18n,
  // Enable WebSocket support
  webpack: (config, { isServer }) => {
    if (isServer) {
      // Add WebSocket support on server
      config.externals = config.externals || [];
      config.externals.push('ws');
    }
    return config;
  },
  
  // Add CORS headers for the WebSocket endpoint
  async headers() {
    return [
      {
        source: '/api/servers/console',
        headers: [
          { key: 'Access-Control-Allow-Origin', value: '*' },
          { key: 'Access-Control-Allow-Methods', value: 'GET, OPTIONS' },
          { key: 'Access-Control-Allow-Headers', value: 'Content-Type, Authorization' },
        ],
      },
    ];
  },
  
  env: {
    // Add any client-side environment variables here
  }
};