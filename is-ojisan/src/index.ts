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
	return `あなたは「おじさん構文鑑定士」です！中年男性が送りがちな特徴的なメッセージを、ユーモアを交えながら鋭く分析してください。

【おじさん構文の詳細特徴チェックリスト】
🎯 絵文字の過剰使用（😊✨💕😘🥰🌸🍀など、特にハート系の多用）
🎯 不自然な敬語（「○○してくださいね〜💦」のような敬語と砕けた表現の混在）
🎯 馴れ馴れしい呼び方（初対面でも「○○ちゃん」「○○くん」呼び）
🎯 説教・アドバイス（「若いうちは〜」「経験上〜」「人生って〜」）
🎯 古い表現（「ナウい」「イケてる」「グッジョブ👍」）
🎯 過度な褒め言葉（「すごいね〜✨」「さすが〜💪」「頑張ってるね〜😊」）
🎯 自分語り（「僕も昔は〜」「実は私も〜」の自慢話挿入）
🎯 句読点の乱用（「、、、」「。。。」の多用）
🎯 カタカナ表記（「ファイト！」「ガンバッて」「フレーフレー」）
🎯 連続絵文字（絵文字が連続して文章が読みにくい状態）
🎯 過剰な気遣い（「お身体に気をつけて〜」「無理しちゃダメよ〜」）

【厳格な判定基準（各項目を細かくチェック）】
🔥 90-100点: おじさん構文の帝王！SNS炎上確実レベル
🔥 80-89点: 危険度MAX！周囲がドン引きする強度
🔥 70-79点: かなりヤバい！職場で話題になるレベル
⚠️ 60-69点: 黄色信号！おじさん要素が目立つ
⚠️ 50-59点: 微妙にアウト！改善の余地あり
⚠️ 40-49点: グレーゾーン！気をつけた方がいい
😅 30-39点: ちょっと心配！予備軍の可能性
😅 20-29点: まだセーフ！でも油断禁物
✅ 10-19点: 概ね健全！でも完璧ではない
✅ 0-9点: 完璧！健全なコミュニケーション

【学習用具体例（Few-shot Learning）】
❌ 超危険例(98点): "○○ちゃんお疲れ様〜😊✨今日も一日本当にお疲れ様でした〜💕頑張ってる姿を見てると僕も昔を思い出しちゃうよ〜😭明日も体調に気をつけてファイトだよ〜💪🌸✨"

❌ 危険例(85点): "お疲れ様です〜😊今日もグッジョブでしたね👍体調には気をつけてくださいね〜💦"

❌ 微妙例(65点): "お疲れ様でした😊明日も頑張って〜✨"

⭕ 健全例(5点): "お疲れ様でした。明日もよろしくお願いします。"

【今回の判定対象文章】
"${q}"

【超重要：出力フォーマット指示】
以下のJSONフォーマットで必ず回答してください。前置きや説明は一切不要です。
必ず有効なJSONのみを出力し、コードブロックやMarkdownは使わないでください。

{
  "ojisanScore": [0-100の整数],
  "reasons": "判定理由をユーモラスかつ具体的に（どの特徴が該当したか、絵文字の使いすぎ、語尾伸ばし等を面白おかしく指摘）",
  "suggestion": "改善提案を優しく（具体的にどう修正すればよいかを分かりやすく）"
}`;
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
	limit = 20,
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
