# urlshortener

## Development

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

### Run tests

```shell
npm run test
```

### Run lint

Without fixing issues:

```shell
npm run lint
```

With fixing issues:

```shell
npm run lint:fix
```

### DB Migration

Local:

```shell
npm run db:migrate:local
```

Production:

```shell
npm run db:migrate:prod
```

## Requirements

このアプリケーションは、URLを短縮するためのものです。以下の要件を満たす必要があります。

- ユーザーは、長いURLを入力して短縮URLを生成できる。
- 短縮URLをクリックすると、元の長いURLにリダイレクトされる。
- 短縮URLは、ランダムな文字列で構成される。
- 短縮URLは、永続化される。

## Spec

### API

#### POST /api/shorten

リクエストボディで指定されたURLを短縮し、それを返します。

リクエスト例:

```http
POST /api/shorten
{
  "url": "https://example.com/some/long/url"
}
```

レスポンス例:

```http
HTTP/1.1 200 OK
{
  "short_url": "https://example.net/abc123"
}
```

詳しい仕様は以下です。

- Rate Limitが存在します。あるIPアドレスは1日に100回までこのエンドポイントを呼び出すことができます。Rate Limitを超えた場合、429 Too Many Requestsエラーが返され、レスポンスヘッダー内の`Retry-After`でリセット時刻が示されます。Rate Limitの情報は、レスポンスヘッダーに、`X-RateLimit-Limit`、`X-RateLimit-Remaining`、`X-RateLimit-Reset`として含まれます。
- 同じURLを短縮しようとした場合、同じ短縮URLが返されます。
- 短縮URLは永続化され、データベースに保存されます。
- URL長の最大値は4096文字です。これを超過した場合、400 Bad Requestエラーが返されます。

#### GET /:short_url

短縮URLを元のURLにリダイレクトします。308 Permanent Redirectを使用します。もし、短縮URLが存在しない場合は404 Not Foundエラーを返します。本エンドポイントにはRate Limitは適用されません。

### 使用技術

メインのデータベースとして Cloudflare D1 を使用します。短縮URLや元のURLの保存に利用されます。

キャッシュやRate Limitの実装には Cloudflare Workers KV を使用します。これにより、短縮URLの生成やリダイレクトの高速化が可能になります。

WebフレームワークとしてHonoを利用します。

## ToDo

- [x] D1データベースのセットアップ
- [x] D1用のテーブル設計・DDL作成
- [x] HonoでAPIルーティングの実装
- [ ] POST /api/shorten の実装
- [ ] GET /:short_url の実装
- [ ] URL長4096文字制限のバリデーション
- [ ] 同じURLに対して同じ短縮URLを返すロジック
- [ ] 308 Permanent Redirectの実装
- [ ] 存在しない短縮URLへの404対応
- [ ] Cloudflare Workers KVのセットアップ
- [ ] Rate Limitの実装（IPごとに1日100回まで）
- [ ] レスポンスヘッダーにRate Limit情報を付与
- [ ] テスト実装
- [ ] Lint対応
