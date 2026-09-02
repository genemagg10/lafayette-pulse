/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: [
    "sigma",
    "graphology",
    "graphology-layout",
    "graphology-layout-forceatlas2",
    "@sigma/node-square",
  ],
  // Allow images from Supabase storage if used in future
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
};

module.exports = nextConfig;
