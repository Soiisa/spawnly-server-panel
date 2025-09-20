// next.config.js
module.exports = {
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
  
  // Other Next.js configuration options can go here
  // For example, if you need to use environment variables on the client side:
  env: {
    // Add any client-side environment variables here
  }
};