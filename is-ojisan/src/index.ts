export default {
	async fetch(
		request: Request,
		env: Env,
		ctx: ExecutionContext,
	): Promise<Response> {
		const { pathname } = new URL(request.url);
		if (pathname !== "/api") {
			return new Response("Not Found", { status: 404 });
		}

		// --- Rate Limit check ---
		const rl = await checkRateLimit(env, request);
		if (!rl.allowed) return rl.response;

		const q = new URL(request.url).searchParams.get("q");
		if (!q) {
			return new Response(
				"こんにちは！何か判定したい文章がありますか？クエリパラメータ 'q' を指定してください。",
			);
		}

		// --- AI判定プロンプト生成 ---
		const aiPrompt = buildOjisanPrompt(q);

		let aiResult: unknown;
		try {
			aiResult = await env.AI.run("@cf/meta/llama-3.1-8b-instruct", {
				prompt: aiPrompt,
			});
		} catch (e) {
			return new Response(
				JSON.stringify({
					error: "AI API呼び出しに失敗しました",
					raw: String(e),
				}),
				{ headers: { "Content-Type": "application/json" }, status: 500 },
			);
		}

		const result = parseOjisanAIResponse(aiResult);

		return new Response(JSON.stringify(result), {
			headers: { "Content-Type": "application/json" },
		});
	},
} satisfies ExportedHandler<Env>;

// --- おじさん構文プロンプト生成 ---
function buildOjisanPrompt(q: string): string {
	return `あなたは日本語の文章が「おじさん構文」かどうかを判定するAIです。以下の指示に従ってください。

【おじさん構文の説明】
・中年男性が若い女性に送るような、親しみや馴れ馴れしさを感じさせる日本語の文章スタイルです。
・特徴として、絵文字や顔文字（😊✨💕😘🥰など）を多用し、語尾を伸ばしたり、やたらと丁寧だったり、独特の言い回しや呼びかけ（「○○ちゃん」「今日も頑張ってね！」など）が含まれます。
・文章は明るく、フレンドリーで、少ししつこい印象を与えることもあります。

【判定対象の文章】
${q}

【出力形式】
JSON形式で以下の項目を必ず含めて出力してください。
- ojisanScore: おじさん構文度合い（0〜100の数値で、100が最もおじさん構文）
- reasons: おじさん構文と判定した理由（または非該当の場合はその理由）を日本語で簡潔に
- suggestion: おじさん構文度を下げるための具体的な修正案やアドバイスを日本語で
`;
}

// --- AI応答のパース ---
function parseOjisanAIResponse(aiResult: unknown): {
	ojisanScore?: number;
	reasons?: string;
	suggestion?: string;
	error?: string;
	raw?: unknown;
} {
	try {
		let jsonStr: string | undefined;
		if (typeof aiResult === "string") {
			const match = aiResult.match(/\{[\s\S]*\}/);
			if (match) jsonStr = match[0];
		} else if (
			aiResult &&
			typeof aiResult === "object" &&
			"response" in aiResult &&
			typeof (aiResult as { response: unknown }).response === "string"
		) {
			const responseStr = (aiResult as { response: string }).response;
			const match = responseStr.match(/\{[\s\S]*\}/);
			if (match) jsonStr = match[0];
		}
		if (jsonStr) {
			const parsed = JSON.parse(jsonStr);
			return {
				ojisanScore:
					typeof parsed.ojisanScore === "number"
						? parsed.ojisanScore
						: undefined,
				reasons:
					typeof parsed.reasons === "string" ? parsed.reasons : undefined,
				suggestion:
					typeof parsed.suggestion === "string" ? parsed.suggestion : undefined,
			};
		}
		return { error: "AI応答がJSON形式ではありません", raw: aiResult };
	} catch (e) {
		return { error: "AI応答の解析に失敗しました", raw: aiResult };
	}
}

// --- Rate Limit middleware ---
async function checkRateLimit(
	env: Env,
	request: Request,
	limit = 5,
): Promise<
	| { allowed: true; remaining: number; reset: number; limit: number }
	| { allowed: false; response: Response }
> {
	const ip =
		request.headers.get("CF-Connecting-IP") ||
		request.headers.get("x-forwarded-for") ||
		"unknown";
	const kvKey = `rl:${ip}:${new Date().toISOString().slice(0, 10)}`; // per day
	const now = Math.floor(Date.now() / 1000);
	const reset = (() => {
		const d = new Date();
		d.setUTCHours(0, 0, 0, 0);
		d.setUTCDate(d.getUTCDate() + 1);
		return Math.floor(d.getTime() / 1000);
	})();
	let data = (await env.KV.get(kvKey, { type: "json" })) as {
		count: number;
		reset: number;
	} | null;
	if (!data || now > data.reset) {
		data = { count: 0, reset };
	}
	if (data.count >= limit) {
		return {
			allowed: false,
			response: new Response(
				JSON.stringify({ message: "Rate limit exceeded. Try again tomorrow." }),
				{
					status: 429,
					headers: {
						"Content-Type": "application/json",
						"X-RateLimit-Limit": String(limit),
						"X-RateLimit-Remaining": "0",
						"X-RateLimit-Reset": String(data.reset),
					},
				},
			),
		};
	}
	data.count++;
	await env.KV.put(kvKey, JSON.stringify(data), { expiration: data.reset });
	return {
		allowed: true,
		remaining: limit - data.count,
		reset: data.reset,
		limit,
	};
}
