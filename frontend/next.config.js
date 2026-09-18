/** @type {import('next').NextConfig} */
const nextConfig = {
  agentRules: false,
  async rewrites() {
    const apiTarget = process.env.API_PROXY_TARGET ?? "http://127.0.0.1:8000";
    return [
      {
        source: "/api/:path*",
        destination: `${apiTarget}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
