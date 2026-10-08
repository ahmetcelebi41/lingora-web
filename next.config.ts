import type { NextConfig } from "next";
import { PHASE_PRODUCTION_BUILD } from "next/constants";

const nextConfig = (phase: string): NextConfig => ({
  output: "export",
  basePath: phase === PHASE_PRODUCTION_BUILD
    ? process.env.GITHUB_PAGES_BASE_PATH ?? ""
    : "",
});

export default nextConfig;
