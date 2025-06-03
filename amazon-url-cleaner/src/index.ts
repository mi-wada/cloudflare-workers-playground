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

// 楽天 URLクリーナー関数
function cleanRakutenUrl(url: string): string {
	try {
		const urlObj = new URL(url);

		// 楽天ドメインかチェック
		if (!urlObj.hostname.includes("rakuten.co.jp")) {
			throw new Error("これは楽天のURLではありません");
		}

		// 商品ページのパターンをチェック
		if (urlObj.hostname === "item.rakuten.co.jp") {
			// item.rakuten.co.jp/[店舗ID]/[商品ID]/
			const pathMatch = urlObj.pathname.match(/^\/([^\/]+)\/([^\/]+)\/?/);
			if (!pathMatch) {
				throw new Error("商品URLの形式が正しくありません");
			}

			const shopId = pathMatch[1];
			const itemId = pathMatch[2];

			return `${urlObj.protocol}//${urlObj.hostname}/${shopId}/${itemId}/`;
		}

		// 書籍ページの場合
		if (urlObj.hostname === "books.rakuten.co.jp") {
			const pathMatch = urlObj.pathname.match(/^\/rb\/([^\/]+)\/?/);
			if (!pathMatch) {
				throw new Error("書籍URLの形式が正しくありません");
			}

			const bookId = pathMatch[1];
			return `${urlObj.protocol}//${urlObj.hostname}/rb/${bookId}/`;
		}

		throw new Error("対応していない楽天URLの形式です");
	} catch (error) {
		throw new Error(
			`URLのクリーニングに失敗しました: ${error instanceof Error ? error.message : "不明なエラー"}`,
		);
	}
}

// 汎用URLクリーナー関数
function cleanUrl(url: string): string {
	const urlObj = new URL(url);

	// ドメインに応じて適切なクリーナーを選択
	if (urlObj.hostname.includes("amazon.")) {
		return cleanAmazonUrl(url);
	}
	if (urlObj.hostname.includes("rakuten.co.jp")) {
		return cleanRakutenUrl(url);
	}
	throw new Error(
		"対応していないサイトのURLです。現在はAmazonと楽天市場のみサポートしています。",
	);
}

// Define our MCP agent with tools
export class MyMCP extends McpAgent {
	server = new McpServer({
		name: "Amazon & Rakuten URL Cleaner",
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

		// 楽天 URL cleaner tool
		this.server.tool(
			"clean_rakuten_url",
			{
				url: z.string().url("有効なURLを入力してください"),
			},
			async ({ url }) => {
				try {
					const cleanedUrl = cleanRakutenUrl(url);
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

				const cleanedUrl = cleanUrl(targetUrl);

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
    <title>Amazon & Rakuten URL Cleaner</title>
    <style>
        body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
        code { background: #f4f4f4; padding: 2px 4px; border-radius: 3px; }
        pre { background: #f4f4f4; padding: 10px; border-radius: 5px; overflow-x: auto; }
    </style>
</head>
<body>
    <h1>Amazon & Rakuten URL Cleaner</h1>
    <p>Amazonと楽天市場のURLから不要なパラメータを削除し、短くシンプルなURLに変換するツールです。</p>

    <h2>対応サイト</h2>
    <ul>
        <li>Amazon (amazon.com, amazon.co.jp など)</li>
        <li>楽天市場 (item.rakuten.co.jp, books.rakuten.co.jp)</li>
    </ul>

    <h2>利用可能なエンドポイント</h2>
    <ul>
        <li><code>/mcp</code> - MCPサーバーエンドポイント</li>
        <li><code>/api/clean</code> - REST API（POST）</li>
    </ul>

    <h2>REST API使用例</h2>
    <h3>Amazon</h3>
    <pre><code>curl -X POST ${url.origin}/api/clean \\
  -H "Content-Type: application/json" \\
  -d '{
    "url": "https://www.amazon.co.jp/dp/B0BLSTF4XB?ref=sr_1_2&qid=1748929607"
  }'</code></pre>

    <h3>楽天市場</h3>
    <pre><code>curl -X POST ${url.origin}/api/clean \\
  -H "Content-Type: application/json" \\
  -d '{
    "url": "https://item.rakuten.co.jp/shop/item123/?scid=af_pc&gclid=ABC"
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
