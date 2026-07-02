/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@convene/auth", "@convene/core", "@convene/db", "@convene/schemas"],
  serverExternalPackages: ["@prisma/client"],
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
