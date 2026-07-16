/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  async rewrites() {
    if (process.env.NODE_ENV === "production") {
      return [];
    }

    const port = process.env.BACKEND_DEV_PORT || "8000";
    return [
      {
        source: "/api/:path*",
        destination: `http://localhost:${port}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
