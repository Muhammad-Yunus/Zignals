import type { WallItem } from '../types/zignals.ts';

const ALLOWED_MATERIALS = new Set([
  'concrete',
  'brick',
  'drywall',
  'wood',
  'glass',
  'metal',
  'door',
]);

const DEFAULT_THICKNESS: Record<string, number> = {
  concrete: 8,
  brick: 6,
  drywall: 4,
  wood: 4,
  glass: 3,
  metal: 7,
  door: 3,
};

export interface AiDetectionResult {
  walls: Omit<WallItem, 'id'>[];
  modelUsed: string;
}

export function isAiWallDetectorConfigured(): boolean {
  return Boolean(
    process.env.AI_BASE_URL?.trim() &&
      process.env.AI_KEY?.trim() &&
      process.env.AI_MODEL?.trim()
  );
}

function validateAiBaseUrl(rawUrl: string): string {
  const parsed = new URL(rawUrl.trim());
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error('AI_BASE_URL must use http or https protocol.');
  }
  return rawUrl.trim().replace(/\/+$/, '');
}

function extractJsonObject(text: string): unknown {
  const trimmed = text.trim();
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenceMatch ? fenceMatch[1].trim() : trimmed;

  try {
    return JSON.parse(candidate);
  } catch {
    const firstBrace = candidate.indexOf('{');
    const lastBrace = candidate.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      return JSON.parse(candidate.slice(firstBrace, lastBrace + 1));
    }
    throw new Error('AI response did not contain valid JSON.');
  }
}

export async function detectWallsWithAi(params: {
  imageDataUrl: string;
  canvasWidth: number;
  canvasHeight: number;
  existingWalls?: Omit<WallItem, 'id'>[];
  materialThicknessMap?: Map<string, number>;
}): Promise<AiDetectionResult> {
  if (!isAiWallDetectorConfigured()) {
    throw new Error('AI_BASE_URL, AI_KEY, and AI_MODEL must be configured in Secrets.');
  }

  const baseUrl = validateAiBaseUrl(process.env.AI_BASE_URL!);
  const apiKey = process.env.AI_KEY!.trim();
  const model = process.env.AI_MODEL!.trim();

  const endpoint = baseUrl.endsWith('/chat/completions')
    ? baseUrl
    : `${baseUrl}/chat/completions`;

  const hasExisting = Array.isArray(params.existingWalls) && params.existingWalls.length > 0;

  // When CV walls are supplied, ask Vision AI ONLY to classify material types while preserving pixel-exact CV coordinates
  const systemPrompt = hasExisting
    ? [
        'You are an architectural RF floorplan material classifier.',
        'You are given a floorplan image AND a list of pixel-exact wall segments extracted via computer vision (normalized 0..1000 coordinates).',
        'Classify each segment index as one of: "concrete" (exterior/load-bearing), "brick" (heavy masonry), "drywall" (interior partition), "wood", "glass" (window/sliding door), "metal", or "door".',
        'Return ONLY valid JSON: {"classifications":[{"index":number,"materialSlug":"concrete"|"brick"|"drywall"|"wood"|"glass"|"metal"|"door"}]}',
      ].join('\n')
    : [
        'You are a precise architectural floorplan vectorization engine for RF propagation simulation.',
        'Analyze the uploaded floorplan image and detect every structural wall, interior partition wall, glass window, and door as straight 2D line segments.',
        'Return ONLY valid JSON: {"walls":[{"x1":number,"y1":number,"x2":number,"y2":number,"materialSlug":"concrete"|"brick"|"drywall"|"wood"|"glass"|"metal"|"door"}]}',
        'Use normalized coordinates 0..1000 where (0,0) is top-left and (1000,1000) is bottom-right.',
      ].join('\n');

  const userText = hasExisting
    ? `Classify the materialSlug for these ${params.existingWalls!.length} CV-extracted wall segments (normalized 0..1000):\n${JSON.stringify(
        params.existingWalls!.map((w, idx) => ({
          index: idx,
          x1: Math.round((w.x1 / params.canvasWidth) * 1000),
          y1: Math.round((w.y1 / params.canvasHeight) * 1000),
          x2: Math.round((w.x2 / params.canvasWidth) * 1000),
          y2: Math.round((w.y2 / params.canvasHeight) * 1000),
          currentMaterial: w.materialSlug,
        }))
      )}`
    : 'Extract all architectural walls, windows, and doors from this floorplan image in normalized 0..1000 coordinates as JSON.';

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45_000);

  let responseText = '';
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        temperature: 0.1,
        max_tokens: 4096,
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: [
              { type: 'text', text: userText },
              {
                type: 'image_url',
                image_url: { url: params.imageDataUrl, detail: 'high' },
              },
            ],
          },
        ],
      }),
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      throw new Error(
        `AI provider returned HTTP ${res.status}${errBody ? `: ${errBody.slice(0, 220)}` : ''}`
      );
    }

    const payload = (await res.json()) as {
      choices?: Array<{ message?: { content?: string | Array<{ text?: string }> } }>;
    };

    const rawContent = payload?.choices?.[0]?.message?.content;
    if (typeof rawContent === 'string') {
      responseText = rawContent;
    } else if (Array.isArray(rawContent)) {
      responseText = rawContent.map((c) => c.text ?? '').join('\n');
    } else {
      throw new Error('AI response had empty message content.');
    }
  } finally {
    clearTimeout(timeout);
  }

  if (hasExisting) {
    const parsed = extractJsonObject(responseText) as {
      classifications?: Array<{ index?: number; materialSlug?: string }>;
    };
    const classMap = new Map<number, string>();
    if (Array.isArray(parsed?.classifications)) {
      for (const c of parsed.classifications) {
        if (
          typeof c.index === 'number' &&
          typeof c.materialSlug === 'string' &&
          ALLOWED_MATERIALS.has(c.materialSlug.toLowerCase().trim())
        ) {
          classMap.set(c.index, c.materialSlug.toLowerCase().trim());
        }
      }
    }

    const refined = params.existingWalls!.map((w, idx) => {
      const mat = classMap.get(idx) ?? w.materialSlug;
      return {
        ...w,
        materialSlug: mat,
        thickness: params.materialThicknessMap?.get(mat) ?? DEFAULT_THICKNESS[mat] ?? w.thickness,
      };
    });

    return {
      walls: refined,
      modelUsed: model,
    };
  }

  const parsed = extractJsonObject(responseText) as { walls?: unknown[] };
  if (!parsed || !Array.isArray(parsed.walls)) {
    throw new Error('AI response JSON did not include a "walls" array.');
  }

  const normalizedWalls: Omit<WallItem, 'id'>[] = [];
  for (const item of parsed.walls) {
    if (!item || typeof item !== 'object') continue;
    const raw = item as Record<string, unknown>;
    const nx1 = Number(raw.x1);
    const ny1 = Number(raw.y1);
    const nx2 = Number(raw.x2);
    const ny2 = Number(raw.y2);

    if (
      !Number.isFinite(nx1) ||
      !Number.isFinite(ny1) ||
      !Number.isFinite(nx2) ||
      !Number.isFinite(ny2)
    ) {
      continue;
    }

    const looksNormalized =
      Math.max(nx1, ny1, nx2, ny2) <= 1005 && Math.min(nx1, ny1, nx2, ny2) >= -5;

    let x1 = looksNormalized ? (nx1 / 1000) * params.canvasWidth : nx1;
    let y1 = looksNormalized ? (ny1 / 1000) * params.canvasHeight : ny1;
    let x2 = looksNormalized ? (nx2 / 1000) * params.canvasWidth : nx2;
    let y2 = looksNormalized ? (ny2 / 1000) * params.canvasHeight : ny2;

    x1 = Math.round(Math.max(0, Math.min(params.canvasWidth, x1)));
    y1 = Math.round(Math.max(0, Math.min(params.canvasHeight, y1)));
    x2 = Math.round(Math.max(0, Math.min(params.canvasWidth, x2)));
    y2 = Math.round(Math.max(0, Math.min(params.canvasHeight, y2)));

    if (Math.abs(x1 - x2) <= 3) x2 = x1;
    if (Math.abs(y1 - y2) <= 3) y2 = y1;
    if (Math.hypot(x2 - x1, y2 - y1) < 10) continue;

    const rawMat =
      typeof raw.materialSlug === 'string' ? raw.materialSlug.toLowerCase().trim() : 'concrete';
    const materialSlug = ALLOWED_MATERIALS.has(rawMat) ? rawMat : 'concrete';
    const thickness =
      params.materialThicknessMap?.get(materialSlug) ?? DEFAULT_THICKNESS[materialSlug] ?? 6;

    normalizedWalls.push({ x1, y1, x2, y2, materialSlug, thickness });
    if (normalizedWalls.length >= 250) break;
  }

  return { walls: normalizedWalls, modelUsed: model };
}
