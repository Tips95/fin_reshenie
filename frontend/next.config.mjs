/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  async rewrites() {
    if (process.env.NODE_ENV === "production") {
      return [];
    }

    // BACKEND_DEV_URL позволяет смотреть локальную сборку на удалённом API:
    // прокси идёт через сервер Next, поэтому CORS не мешает.
    const target =
      process.env.BACKEND_DEV_URL ||
      `http://localhost:${process.env.BACKEND_DEV_PORT || "8000"}`;

    return [
      {
        source: "/api/:path*",
        destination: `${target.replace(/\/$/, "")}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
