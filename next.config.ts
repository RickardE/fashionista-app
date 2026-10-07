import { networkInterfaces } from "node:os";
import type { NextConfig } from "next";

/**
 * Dev only: let phones on the same network open the dev server via this
 * machine's LAN address (Next blocks dev assets for non-localhost origins).
 * Extra hostnames, e.g. a tunnel, can be added with DEV_ORIGINS=a.com,b.com.
 */
function devOrigins(): string[] {
  const lan = Object.values(networkInterfaces())
    .flat()
    .filter((i) => i && i.family === "IPv4" && !i.internal)
    .map((i) => i!.address);
  const extra = (process.env.DEV_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return [...lan, ...extra];
}

const nextConfig: NextConfig = {
  allowedDevOrigins: devOrigins(),
  async redirects() {
    // The product feed used to live at /discover ("For You").
    return [{ source: "/discover", destination: "/products", permanent: false }];
  },
  images: {
    remotePatterns: [
      // Merchant product photography. Restricted to the image path; the query
      // string is left open because the merchant appends a cache-busting
      // `?timestamp=` that differs per image.
      {
        protocol: "https",
        hostname: "www.johnells.se",
        pathname: "/pub_images/**",
      },
    ],
  },
};

export default nextConfig;
