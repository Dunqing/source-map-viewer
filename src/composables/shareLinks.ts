import { compressToHash, type ShareableData } from "./useShareableUrl";
import { buildComparePath, replaceCurrentPath } from "./navigation";

interface ShareResponse {
  id?: string;
  url?: string;
}

async function createShortShare(data: ShareableData): Promise<ShareResponse | null> {
  try {
    const response = await fetch("/api/share", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!response.ok) return null;
    const share = (await response.json()) as Partial<ShareResponse>;
    const id = typeof share.id === "string" ? share.id : undefined;
    const url = typeof share.url === "string" ? share.url : undefined;
    if (!id && !url) {
      return null;
    }
    return { id, url };
  } catch {
    return null;
  }
}

export async function createShareSlug(data: ShareableData): Promise<string> {
  const share = await createShortShare(data);
  return share?.id ?? compressToHash(data);
}

export async function createSharePath(data: ShareableData): Promise<string> {
  return `/${await createShareSlug(data)}`;
}

export async function createComparePath(data: ShareableData): Promise<string> {
  return buildComparePath(await createShareSlug(data));
}

export async function copyShareUrl(data: ShareableData): Promise<"short" | "inline"> {
  const share = await createShortShare(data);
  if (share?.id || share?.url) {
    const shortUrl = share.url ?? `${window.location.origin}/${share.id}`;
    await navigator.clipboard.writeText(shortUrl);
    replaceCurrentPath(share.id ? `/${share.id}` : new URL(shortUrl).pathname);
    return "short";
  }

  const slug = await compressToHash(data);
  await navigator.clipboard.writeText(`${window.location.origin}/${slug}`);
  return "inline";
}
