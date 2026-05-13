/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [
      {
        source: '/api/chat',
        destination: 'http://localhost:3000/chat',
      },
      {
        source: '/api/sources/:traceId',
        destination: 'http://localhost:3000/sources/:traceId',
      },
    ];
  },
};

module.exports = nextConfig;
