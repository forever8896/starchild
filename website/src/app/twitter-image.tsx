import { ogAlt, ogSize, ogContentType, renderOg } from "@/lib/og";

export const alt = ogAlt;
export const size = ogSize;
export const contentType = ogContentType;

export default async function Image() {
  return renderOg();
}
