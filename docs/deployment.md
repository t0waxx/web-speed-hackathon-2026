## アプリケーションのデプロイ方法

提出用環境の作成は、以下のいずれかの手順でローカルのアプリケーションをデプロイすることで行えます。
なお、スコア計測中にデプロイを行うと正しく採点されないことがありますので、注意してください。

### fly.io

1. このレポジトリを自分のレポジトリに fork します
   - https://docs.github.com/ja/github/getting-started-with-github/fork-a-repo
2. fork したレポジトリから [CyberAgentHack/web-speed-hackathon-2026](https://github.com/CyberAgentHack/web-speed-hackathon-2026/) へ Pull Request を作成します
   - https://docs.github.com/ja/pull-requests/collaborating-with-pull-requests/proposing-changes-to-your-work-with-pull-requests/creating-a-pull-request-from-a-fork
3. GitHub Actions により自動的に fly.io へデプロイされます
4. アプリケーションへは Pull Request 下部の `View Deployment` からアクセスできます

> [!NOTE]
>
> デプロイプロセスまたはアプリケーション起動プロセスでエラーが発生した場合
>
> エラーによりデプロイしようとしたアプリケーションにアクセスできない場合は、運営から提供されるアクセストークンを指定して [`fly logs`](https://fly.io/docs/flyctl/logs/) を実行することで、ログを確認できます。
>
> ```bash
> fly logs --app pr-<PR 番号>-web-speed-hackathon-2026 --access-token <アクセストークン>
> ```

> [!CAUTION]
>
> **`fly.toml` の内容を変更してはならない**
>
> `fly.toml` を変更した場合、順位対象外となります。

### fly.io 以外へのデプロイ

> [!WARNING]
>
> **発生した費用は自己負担となります**

レギュレーションを満たし、採点が可能であれば fly.io 以外へデプロイしても構いません。

---

### GCP（Cloud Run）へのデプロイ

> [!WARNING]
>
> **発生した費用は自己負担となります**

#### 前提

- `gcloud` CLI がインストール済みで認証済み
- `terraform` CLI がインストール済み
- GCP プロジェクトに以下が作成済み
  - Artifact Registry リポジトリ（`web-speed-hackathon-2026`）
  - Cloud Build / Cloud Run の API が有効

#### 初回セットアップ

```bash
# tfvars を用意
cp terraform/terraform.tfvars.example terraform/terraform.tfvars
# project_id などを編集
vi terraform/terraform.tfvars

# Terraform 初期化
make terraform-init
```

#### 通常デプロイ（コード変更後）

```bash
make gcp-deploy
# または TAG を明示する場合
make gcp-deploy TAG=v1.2.3
```

内部で行われること：

1. **Cloud Build Step 1** — `oven/bun:1.3.9` で `bun install`
2. **Cloud Build Step 2** — `node:24` で webpack ビルド（`application/dist/` に出力）
3. **Cloud Build Step 3** — Docker イメージをビルドして Artifact Registry へ push
4. **Terraform apply** — Cloud Run サービス・LB を更新
5. **`gcloud run deploy`** — 新リビジョンを強制作成（同タグの差し替えを反映させるため必須）

> **なぜ Step 5 が必要か**
>
> Terraform は同一タグ名ではイメージ差し替えを検知しない。
> コード変更のたびに `git commit` してタグ（SHA）を変えれば Step 5 は冪等になるが、
> 同一コミット上で再ビルドした場合でも確実に反映するためスクリプトに組み込んである。

#### ビルドなしで再デプロイ（リビジョンだけ再作成したい場合）

```bash
make gcp-redeploy
```

#### ログ確認

```bash
make gcp-logs
# または直接
gcloud run services logs tail wsh-app --region=asia-northeast1
```

#### URL 確認

```bash
# Cloud Run の直接 URL
gcloud run services describe wsh-app --region=asia-northeast1 --format='value(status.url)'

# LB の IP（terraform output）
make terraform-output
```

#### ビルドの仕組み（トラブルシュート用）

`cloudbuild.yaml` は3ステップ構成。

| ステップ | イメージ | 役割 |
|---|---|---|
| 0 | `oven/bun:1.3.9` | `bun install`（依存インストール） |
| 1 | `node:24` | `webpack` 実行（`application/dist/` を生成） |
| 2 | `gcr.io/cloud-builders/docker` | Docker ビルド & push |

> **なぜ webpack を `oven/bun` イメージ内で実行しないか**
>
> `oven/bun` の `node` コマンドは Bun の Node.js 互換シムであり、
> `webpack-cli` と非互換のため無出力で終了（exit 0）する。
> Node.js 本体が入った `node:24` で実行することで解消している。
