/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // NEXT_DIST_DIR lets a new build be made beside the live one and swapped in, so the running site isn't broken mid-build.
  distDir: process.env.NEXT_DIST_DIR || ".next",
};
export default nextConfig;
