import type { NextConfig } from "next";

const repositoryName = process.env.GITHUB_REPOSITORY?.split("/").at(-1);
const pagesBasePath =
  process.env.GITHUB_ACTIONS === "true" && repositoryName
    ? `/${repositoryName}`
    : "";

const nextConfig = {
  output: "export",
  basePath: pagesBasePath,
  assetPrefix: pagesBasePath,
  images: {
    unoptimized: true,
  },
  reactCompiler: true,
  trailingSlash: true,
} satisfies NextConfig;

export default nextConfig;
