const DEFAULT_HOST = "https://source-map-viewer.void.app";

export interface ShareResponse {
  id: string;
  url: string;
}

export async function upload(
  generatedCode: string,
  sourceMapJson: string,
  host?: string,
): Promise<ShareResponse> {
  const baseUrl = host ?? DEFAULT_HOST;
  const res = await fetch(`${baseUrl}/api/share`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ generatedCode, sourceMapJson }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Upload failed (${res.status}): ${text || res.statusText}`);
  }

  return res.json();
}
