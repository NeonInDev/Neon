import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const API = process.env.NEON_API_URL || "http://localhost:3000";
const KEY = process.env.NEON_MASTER_KEY || "";

type Ctx = { params: Promise<{ path: string[] }> };

async function proxy(request: Request, path: string[]) {
  const alvo = new URL(`/api/${path.join("/")}`, API);
  const origem = new URL(request.url);
  origem.searchParams.forEach((v, k) => alvo.searchParams.append(k, v));

  const headers = new Headers();
  const ct = request.headers.get("content-type");
  if (ct) headers.set("content-type", ct);
  headers.set("x-hud-key", KEY);

  const init: RequestInit = { method: request.method, headers, redirect: "follow" };
  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = Buffer.from(await request.arrayBuffer());
  }

  try {
    const resp = await fetch(alvo, init);
    const body = Buffer.from(await resp.arrayBuffer());
    const out = new Headers();
    out.set("content-type", resp.headers.get("content-type") || "application/json");
    out.set("content-length", String(body.length));
    return new Response(new Uint8Array(body), { status: resp.status, headers: out });
  } catch (err) {
    return NextResponse.json(
      { erro: `Nao consegui falar com a Neon (${API}). Ela esta rodando?` },
      { status: 502 }
    );
  }
}

export async function GET(request: Request, { params }: Ctx) {
  const { path } = await params;
  return proxy(request, path);
}

export async function POST(request: Request, { params }: Ctx) {
  const { path } = await params;
  return proxy(request, path);
}

export async function OPTIONS(request: Request, { params }: Ctx) {
  const { path } = await params;
  return proxy(request, path);
}
