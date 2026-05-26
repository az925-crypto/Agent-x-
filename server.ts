import express, { type Request, type Response, type NextFunction } from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { Type } from "@google/genai";
import rateLimit from "express-rate-limit";
import { validateTarget, GeoJSResponse, resolveTargetData, fetchGeoIP } from "./src/utils";
import { SYSTEM_PROMPT } from "./tools/ai-agent/shared";
import { createAIProvider, getModel, getProviderInfo, recreateProvider } from "./tools/ai-agent/provider";
import type { AIClient } from "./tools/ai-agent/provider";
import "dotenv/config";

async function startServer() {
  const app = express();
  const PORT = parseInt(process.env.PORT || "3000", 10);

  app.use(express.json());

  // Rate Limiter (exclude /api/status)
  const limiter = rateLimit({
    windowMs: 60 * 1000, 
    max: 10,
    message: { error: 'Too many requests. Try again in 1 minute.' }
  });
  app.use('/api/osint', limiter);

  // FIX #18: CSRF — only allow requests from localhost origins
  app.use("/api", (req: Request, res: Response, next: NextFunction) => {
    const origin = req.headers.origin;
    const host   = req.headers.host || "";
    const allowedOrigins = [`http://localhost:${PORT}`, `http://127.0.0.1:${PORT}`];
    if (origin && !allowedOrigins.includes(origin)) {
      return res.status(403).json({ error: "Origin not allowed" });
    }
    next();
  });

  // Initialize AI provider (Gemini or OpenRouter)
  let ai: AIClient | null = null;
  try {
    ai = createAIProvider();
  } catch {
    ai = null;
  }

  // API Routes
  app.get("/api/status", async (req, res) => {
    const providerType = process.env.AI_PROVIDER || 'gemini';
    const keyStatus = providerType === 'openrouter'
      ? !!process.env.OPENROUTER_API_KEY
      : providerType === 'zen'
        ? !!process.env.ZEN_API_KEY
        : !!process.env.GEMINI_API_KEY;

    if (!keyStatus) {
      return res.json({ aiStatus: "NOT_CONFIGURED", provider: providerType });
    }
    
    if (!ai) {
      return res.json({ aiStatus: "ERROR", reason: "AI Client not initialized", provider: providerType });
    }

    const model = getModel();
    try {
      await ai.generateContent({
        model,
        contents: [{ role: 'user', parts: [{ text: 'ping' }] }],
        config: { maxOutputTokens: 5 },
      });
      
      res.json({ aiStatus: "CONNECTED", provider: providerType, model });
    } catch (e: any) {
      res.json({ aiStatus: "ERROR", reason: e.message || 'Network or API Error', provider: providerType, model });
    }
  });

  // Reload provider (read .env changes without restart)
  app.post("/api/admin/reload-provider", async (req, res) => {
    try {
      ai = recreateProvider();
      const info = getProviderInfo();
      res.json({ success: true, provider: info.type, model: info.model });
    } catch (e: any) {
      ai = null;
      res.status(500).json({ error: e.message || 'Failed to reload provider' });
    }
  });

  app.post("/api/osint/scan", async (req, res) => {
    try {
      if (!ai) {
        return res.status(500).json({ error: "AI provider is not configured." });
      }

      const { target } = req.body;
      // Input Validation
      if (!validateTarget(target)) {
        return res.status(400).json({ error: "Invalid target payload." });
      }

      // Normalize type to uppercase for backend consistency
      const targetType = target.type.toUpperCase();
      const targetValue = target.value.trim().toLowerCase();
      
      const dns = await import('dns/promises');
      const { resolvedIPs, geoData } = await resolveTargetData(
        targetType,
        targetValue,
        async (domain: string) => await dns.resolve4(domain),
        async (domain: string) => {
          const records = await dns.resolveMx(domain);
          return records.map((r: any) => r.exchange);
        },
        async (ip: string) => {
          return await fetchGeoIP(ip);
        }
      );

      // Gather real facts to pass to the AI
      const prompt = `Perform security and OSINT analysis based on the following REAL DATA just resolved by our server:
Target: ${targetValue}
Target Type: ${targetType}

[REAL INFRASTRUCTURE DATA]
- ${target.type === "EMAIL" ? "MX Records" : "IP Resolution"}: ${resolvedIPs.length > 0 ? resolvedIPs.join(", ") : "Could not resolve"}
- GeoIP Location: ${geoData.city ? geoData.city + ", " + geoData.country : "Unknown/Not applicable"}
- Organization/ISP: ${geoData.organization_name || geoData.organization || "Unknown"}
- ASN: ${geoData.asn || "Unknown"}

As Agent-X, a Threat Intelligence analyst, create a concise report based on the actual technical data above. If IP/Domain/Email data is not found, state that the digital footprint is minimal/inactive. If the target is a USERNAME, state that you are analyzing the footprint contextually and results are estimates.
Your job is to produce PURE JSON output (no markdown), using this schema:
{
  "narrative": "Brief explanation of security threat or infrastructure status of the target",
  "threatLevel": "LOW / MEDIUM / HIGH / CRITICAL (Choose based on data, e.g. no data = LOW)",
  "findings": ["DNS data found: ...", "Server location: ...", "Organization: ..."]
}`;

      const result = await ai.generateContent({
        model: getModel(),
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        systemInstruction: SYSTEM_PROMPT,
        config: {
          temperature: 0.7,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              narrative: { type: Type.STRING },
              threatLevel: { type: Type.STRING },
              findings: { type: Type.ARRAY, items: { type: Type.STRING } }
            },
            required: ["narrative", "threatLevel", "findings"]
          }
        }
      });

      let report: Record<string, unknown>;
      try {
        report = JSON.parse(result.text || "{}");
      } catch {
        return res.status(500).json({ error: "AI response parsing failed." });
      }

      res.json({
        success: true,
        report: {
          target: { type: targetType, value: targetValue },
          ...report
        }
      });
    } catch (error: any) {
      console.error("OSINT Scan error:", error.message);
      // Don't leak stack trace to client
      res.status(500).json({ error: "Analysis failed on the server. Please try again later." });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "127.0.0.1", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
