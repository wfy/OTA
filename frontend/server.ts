import express from "express";
import path from "path";
import dotenv from "dotenv";
import compression from "compression";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(compression());

// Lazy-initialized Gemini client
let aiClient: GoogleGenAI | null = null;
function getGenAI() {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY environment variable is missing.");
    }
    aiClient = new GoogleGenAI({ apiKey });
  }
  return aiClient;
}

// Health check endpoint
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// AI Assistant endpoint for Overhead Transmission Line Design advice
app.post("/api/ai-assist", async (req, res) => {
  try {
    const { prompt, context } = req.body;
    if (!prompt) {
      return res.status(400).json({ error: "Prompt is required" });
    }

    const ai = getGenAI();

    const systemInstruction = `你是一位基于《架空输电线路电气设计规程》(DL/T 5582-2020)及电力工程力学规范的输电线路设计专家。
请为用户解答关于架空输电线路导线选型、比荷计算、状态方程式求解、应力弧垂特性、绝缘子片数配置、风偏角校验及对地安全距离等专业技术问题。
回答需严谨、条理清晰，引述 DL/T 5582-2020 条文依据（如第5章导线和地线、第6章绝缘配合、第9章导地线布置与风偏、第10章交叉跨越与对地距离）。
请结合用户提供的以下当前工程计算上下文给出精准针对性的分析或建议。

【当前工程计算参数与结果上下文】：
${JSON.stringify(context || {}, null, 2)}
`;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        systemInstruction,
        temperature: 0.3,
      },
    });

    return res.json({ text: response.text });
  } catch (err: any) {
    console.error("Error in /api/ai-assist:", err);
    return res.status(500).json({
      error: err.message || "AI consultation failed.",
    });
  }
});

async function startServer() {
  console.log(`[server] NODE_ENV=${process.env.NODE_ENV}`);
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running at http://localhost:${PORT}`);
  });
}

startServer();
