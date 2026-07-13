import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // next/image refuses remote hosts unless allowlisted. All product,
    // banner, and brand media is served from this Cloudinary account —
    // the pathname pin keeps other Cloudinary accounts' assets out of
    // our image optimizer.
    remotePatterns: [
      {
        protocol: "https",
        hostname: "res.cloudinary.com",
        pathname: "/dnlzgwzeo/**",
      },
    ],
  },
};

export default nextConfig;
