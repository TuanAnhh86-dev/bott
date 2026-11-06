import { NextResponse } from "next/server";

type JsonBodyResult =
  | { success: true; data: unknown }
  | { success: false; response: NextResponse };

export function validateSameOriginJsonRequest(request: Request): NextResponse | null {
  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");
  const secFetchSite = request.headers.get("sec-fetch-site");
  let matches = false;

  try {
    if (origin) {
      const originUrl = new URL(origin);
      const reqUrl = new URL(request.url);
      const hostHeader = request.headers.get("host");

      const originHost = originUrl.host;
      const targetHost = hostHeader || reqUrl.host;

      matches =
        originUrl.origin === reqUrl.origin ||
        originHost === targetHost ||
        (process.env.NODE_ENV !== "production" &&
          (originHost.includes("localhost") || originHost.includes("127.0.0.1")) &&
          (targetHost.includes("localhost") || targetHost.includes("127.0.0.1")));
    } else if (referer) {
      const refererUrl = new URL(referer);
      const reqUrl = new URL(request.url);
      const hostHeader = request.headers.get("host");
      const refererHost = refererUrl.host;
      const targetHost = hostHeader || reqUrl.host;

      matches =
        refererUrl.origin === reqUrl.origin ||
        refererHost === targetHost ||
        (process.env.NODE_ENV !== "production" &&
          (refererHost.includes("localhost") || refererHost.includes("127.0.0.1")) &&
          (targetHost.includes("localhost") || targetHost.includes("127.0.0.1")));
    } else if (secFetchSite === "same-origin") {
      // Browser guarantees same-origin request
      matches = true;
    }
  } catch {
    matches = false;
  }

  if (!matches) {
    return NextResponse.json({ error: "Yêu cầu không cùng nguồn." }, { status: 403 });
  }

  const contentType = request.headers.get("content-type") ?? "";
  if (!/^application\/json(?:\s*;|$)/i.test(contentType)) {
    return NextResponse.json({ error: "Yêu cầu phải sử dụng JSON." }, { status: 415 });
  }

  return null;
}

export async function readJsonBody(request: Request, maxBytes = 64 * 1024): Promise<JsonBodyResult> {
  const contentLength = request.headers.get("content-length");
  if (contentLength && Number(contentLength) > maxBytes) {
    return {
      success: false,
      response: NextResponse.json({ error: "Nội dung yêu cầu quá lớn." }, { status: 413 }),
    };
  }

  if (!request.body) {
    return { success: false, response: NextResponse.json({ error: "Nội dung JSON không hợp lệ." }, { status: 400 }) };
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel();
        return {
          success: false,
          response: NextResponse.json({ error: "Nội dung yêu cầu quá lớn." }, { status: 413 }),
        };
      }
      chunks.push(value);
    }

    const body = new Uint8Array(totalBytes);
    let offset = 0;
    for (const chunk of chunks) {
      body.set(chunk, offset);
      offset += chunk.byteLength;
    }

    return { success: true, data: JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(body)) };
  } catch {
    return { success: false, response: NextResponse.json({ error: "Nội dung JSON không hợp lệ." }, { status: 400 }) };
  } finally {
    reader.releaseLock();
  }
}
