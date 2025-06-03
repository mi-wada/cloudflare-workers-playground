export default {
	async fetch(request, env, ctx): Promise<Response> {
		const { pathname } = new URL(request.url);
		if (pathname !== "/api") {
			return new Response("Not Found", { status: 404 });
		}
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
