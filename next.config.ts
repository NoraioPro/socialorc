import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Dev is often browsed from another device on the LAN/Tailnet rather than
  // localhost. Next blocks cross-origin /_next/* requests by default, which
  // silently breaks hydration — forms then submit natively and sign-in looks
  // like it does nothing. List the hosts we actually browse from.
  allowedDevOrigins: [
    "100.81.170.104",
    "10.97.73.43",
    "192.168.64.1",
    "*.ts.net",
  ],
};

export default nextConfig;
