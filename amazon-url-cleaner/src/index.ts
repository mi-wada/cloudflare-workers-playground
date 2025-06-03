import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

// Amazon URLクリーナー関数
function cleanAmazonUrl(url: string): string {
	try {
		const urlObj = new URL(url);

		// Amazonドメインかチェック
		if (!urlObj.hostname.includes("amazon.")) {
			throw new Error("これはAmazonのURLではありません");
		}

		// DPまたはGPの商品IDを抽出
		const pathMatch = urlObj.pathname.match(/\/(dp|gp)\/(?:product\/)?([A-Z0-9]{10})/);
		if (!pathMatch) {
			throw new Error("商品IDが見つかりませんでした");
		}

		const productId = pathMatch[2];

		// クリーンなURLを構築
		const cleanUrl = `${urlObj.protocol}//${urlObj.hostname}/dp/${productId}`;

		return cleanUrl;
	} catch (error) {
		throw new Error(
			`URLのクリーニングに失敗しました: ${error instanceof Error ? error.message : "不明なエラー"}`,
		);
	}
}

// Define our MCP agent with tools
export class MyMCP extends McpAgent {
	server = new McpServer({
		name: "Amazon URL Cleaner",
		version: "1.0.0",
	});

	async init() {
		// Amazon URL cleaner tool
		this.server.tool(
			"clean_amazon_url",
			{
				url: z.string().url("有効なURLを入力してください"),
			},
			async ({ url }) => {
				try {
					const cleanedUrl = cleanAmazonUrl(url);
					return {
						content: [
							{
								type: "text",
								text: `クリーンなURL: ${cleanedUrl}`,
							},
						],
					};
				} catch (error) {
					return {
						content: [
							{
								type: "text",
								text: `エラー: ${error instanceof Error ? error.message : "不明なエラーが発生しました"}`,
							},
						],
					};
				}
			},
		);
	}
}

// REST APIのリクエスト/レスポンス型定義
const CleanUrlRequest = z.object({
	url: z.string().url("有効なURLを入力してください"),
});

const CleanUrlResponse = z.object({
	cleanedUrl: z.string(),
});

const ErrorResponse = z.object({
	error: z.string(),
});

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		const url = new URL(request.url);

		// MCPエンドポイント（SSE）
		if (url.pathname === "/sse" || url.pathname === "/sse/message") {
			return MyMCP.serveSSE("/sse").fetch(request, env, ctx);
		}

		// MCPエンドポイント
		if (url.pathname === "/mcp") {
			return MyMCP.serve("/mcp").fetch(request, env, ctx);
		}

		// REST APIエンドポイント
		if (url.pathname === "/api/clean" && request.method === "POST") {
			try {
				const body = await request.json();
				const { url: targetUrl } = CleanUrlRequest.parse(body);

				const cleanedUrl = cleanAmazonUrl(targetUrl);

				const response = CleanUrlResponse.parse({ cleanedUrl });

				return new Response(JSON.stringify(response), {
					status: 200,
					headers: {
						"Content-Type": "application/json",
						"Access-Control-Allow-Origin": "*",
						"Access-Control-Allow-Methods": "POST, OPTIONS",
						"Access-Control-Allow-Headers": "Content-Type",
					},
				});
			} catch (error) {
				const errorMessage =
					error instanceof Error ? error.message : "不明なエラーが発生しました";
				const errorResponse = ErrorResponse.parse({ error: errorMessage });

				return new Response(JSON.stringify(errorResponse), {
					status: 400,
					headers: {
						"Content-Type": "application/json",
						"Access-Control-Allow-Origin": "*",
						"Access-Control-Allow-Methods": "POST, OPTIONS",
						"Access-Control-Allow-Headers": "Content-Type",
					},
				});
			}
		}

		// CORS preflight request
		if (request.method === "OPTIONS") {
			return new Response(null, {
				status: 200,
				headers: {
					"Access-Control-Allow-Origin": "*",
					"Access-Control-Allow-Methods": "POST, OPTIONS",
					"Access-Control-Allow-Headers": "Content-Type",
				},
			});
		}

		// ルートパスでの簡単な説明
		if (url.pathname === "/") {
			const html = `
<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Amazon URL Cleaner</title>
    <style>
        body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
        code { background: #f4f4f4; padding: 2px 4px; border-radius: 3px; }
        pre { background: #f4f4f4; padding: 10px; border-radius: 5px; overflow-x: auto; }
    </style>
</head>
<body>
    <h1>Amazon URL Cleaner</h1>
    <p>AmazonのURLから不要なパラメータを削除し、短くシンプルなURLに変換するツールです。</p>

    <h2>利用可能なエンドポイント</h2>
    <ul>
        <li><code>/mcp</code> - MCPサーバーエンドポイント</li>
        <li><code>/api/clean</code> - REST API（POST）</li>
    </ul>

    <h2>REST API使用例</h2>
    <pre><code>curl -X POST ${url.origin}/api/clean \\
  -H "Content-Type: application/json" \\
  -d '{
    "url": "https://www.amazon.co.jp/dp/B0BLSTF4XB?ref=sr_1_2&qid=1748929607"
  }'</code></pre>
</body>
</html>`;

			return new Response(html, {
				headers: {
					"Content-Type": "text/html; charset=utf-8",
				},
			});
		}

		return new Response("Not found", { status: 404 });
	},
};
