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
				"こんにちは！何か質問がありますか？クエリパラメータ 'q' を指定してください。",
			);
		}

		const response = await env.AI.run("@cf/meta/llama-3.1-8b-instruct", {
			prompt: `あなたは「おじさん構文」を生成するAIです。以下の指示に従って、与えられた文章をおじさん構文に変換してください。

【おじさん構文の説明】
・中年男性が若い女性に送るような、親しみや馴れ馴れしさを感じさせる日本語の文章スタイルです。
・特徴として、絵文字や顔文字（😊✨💕😘🥰など）を多用し、語尾を伸ばしたり、やたらと丁寧だったり、独特の言い回しや呼びかけ（「○○ちゃん」「今日も頑張ってね！」など）が含まれます。
・文章は明るく、フレンドリーで、少ししつこい印象を与えることもあります。

【変換対象の文章】
${q}

【出力形式】
おじさん構文に変換した日本語の文章のみを出力してください。`,
		});

		return new Response(JSON.stringify(response));
	},
} satisfies ExportedHandler<Env>;

// --- Rate Limit middleware ---
async function checkRateLimit(
	env: Env,
	request: Request,
	limit = 10,
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
