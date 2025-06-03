# Amazon URL Cleaner

Amazonの商品ページのURLから不要なパラメータを削除し、短くシンプルなURLに変換するツールです。誰かにURLをシェアする際に綺麗にしたい場合にご利用ください。MCPとRESTの2つのインターフェースを提供しています。

Before:

```plaintext
https://www.amazon.co.jp/Amazon-com-Amazon-%E3%83%AD%E3%82%B4-Two-color-T%E3%82%B7%E3%83%A3%E3%83%84/dp/B0BLSTF4XB/ref=sr_1_2?dib=eyJ2IjoiMSJ9.RRAFJKVrFKp5jIsMmSGkO05kcq31NjexYvHsPJy0YmkMF249_n4Dg1jQg20B8KtuqS9HaCRj94uLRSkEyoFjWqIQnzpXpKL71duHkeKZ0gSBF42uAXCZCzoMJvE5wY-y9XVPSItzGN67iQJ-a2Qq4urvI8EvihE13PaYKwPytxN233-QGsCDtOaVfbPa2k5mTCknbLRfxTujnojEqwimjJuvIdOTrn5ui27qFxYbaXU5VelGfJP1w7sRmYOIFCZDpwDU0ETfwz2UIpJ74vzIg4DzjlhfBCU0H3uTgZxjGa8.jnU3uGBQwRUvIB5R8sgC7jNUV7_HaquxCGIOcohHI8g&dib_tag=se&qid=1748929607&sr=8-2&srs=13049905051&customId=B07537SGL9&customizationToken=MC_Assembly_1%23B07537SGL9&th=1&psc=1
```

After:

```plaintext
https://www.amazon.co.jp/dp/B0BLSTF4XB
```

## 使い方

MCP、REST APIそれぞれの使い方を説明します。

なお、各環境のURLは以下の通りで、文中の `$URL` はこれらのURLに置き換えてください。

- ローカル: `http://localhost:8787`
- 本番: `https://amazon-url-cleaner.test-20241005.workers.dev/`

### MCP

以下の設定を追加してください。

```jsonc
{
  // ...
  "amazon_url_cleaner": {
    "command": "npx",
    "args": ["mcp-remote", "$URL/mcp"]
  }
}
```

以下の tools が利用可能です。

- `clean_amazon_url`: AmazonのURLを短くします。

### REST API

```bash
curl -X POST $URL/api/clean \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://www.amazon.co.jp/Amazon-com-Amazon-%E3%83%AD%E3%82%B4-Two-color-T%E3%82%B7%E3%83%A3%E3%83%84/dp/B0BLSTF4XB/ref=sr_1_2?dib=eyJ2IjoiMSJ9.RRAFJKVrFKp5jIsMmSGkO05kcq31NjexYvHsPJy0YmkMF249_n4Dg1jQg20B8KtuqS9HaCRj94uLRSkEyoFjWqIQnzpXpKL71duHkeKZ0gSBF42uAXCZCzoMJvE5wY-y9XVPSItzGN67iQJ-a2Qq4urvI8EvihE13PaYKwPytxN233-QGsCDtOaVfbPa2k5mTCknbLRfxTujnojEqwimjJuvIdOTrn5ui27qFxYbaXU5VelGfJP1w7sRmYOIFCZDpwDU0ETfwz2UIpJ74vzIg4DzjlhfBCU0H3uTgZxjGa8.jnU3uGBQwRUvIB5R8sgC7jNUV7_HaquxCGIOcohHI8g&dib_tag=se&qid=1748929607&sr=8-2&srs=13049905051&customId=B07537SGL9&customizationToken=MC_Assembly_1%23B07537SGL9&th=1&psc=1"
  }'
```

Response:

```json
{
  "cleanedUrl": "https://www.amazon.co.jp/dp/B0BLSTF4XB"
}
```

## 開発

### Prerequisites

- Node.js
- npm

### Deploy

```shell
npm run deploy
```

### Run locally

```shell
npm run dev
```

### Test

```shell
npm run test
```

### Lint

Without fixing issues:

```shell
npm run lint
```

With fixing issues:

```shell
npm run lint:fix
```
