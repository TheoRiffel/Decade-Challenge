/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  async rewrites() {
    const apiUrl = process.env.API_URL ?? 'http://localhost:3000';
    return [
      {
        source: '/api/sources/:traceId',
        destination: `${apiUrl}/sources/:traceId`,
      },
    ];
  },
};

module.exports = nextConfig;
