# Web Speed Hackathon 2026 — docs/README に沿ったよく使う操作
# 前提: mise で Node 24 / Bun が使えること（mise.toml・docs/development.md）

.DEFAULT_GOAL := help

APP_DIR        := application
SCORE_DIR      := scoring-tool
TF_DIR         := terraform
# Terraform plan / apply 用（未指定なら tfvars の image_tag に依存。check で両方空は不可）
IMAGE_TAG      ?=
# make gcp-deploy TAG=... でイメージタグを上書き（省略時は Git 短 SHA）
TAG            ?=
# ローカル起動時のデフォルト（application/README.md）
APPLICATION_URL ?= http://localhost:3000
# スコア計測対象名の部分一致文字列（score-one で使用）
SCORE_TARGET ?=
# E2E テストの絞り込み（空の場合は全件）
E2E_SPEC ?=
E2E_GREP ?=

.PHONY: help
help:
	@echo "利用可能なターゲット（詳細は docs/・各 README 参照）:"
	@echo ""
	@echo "  セットアップ"
	@echo "    make setup          … mise trust + mise install + アプリ・計測ツールの bun install"
	@echo "    make mise-trust     … mise trust（初回・mise.toml 変更時）"
	@echo "    make mise-install   … mise install（Node / Bun のバージョン固定）"
	@echo "    make install-app    … $(APP_DIR) で bun install --frozen-lockfile"
	@echo "    make install-scoring… $(SCORE_DIR) で bun install --frozen-lockfile"
	@echo ""
	@echo "  CaX アプリケーション（$(APP_DIR)）"
	@echo "    make build          … クライアントビルド（bun run build）"
	@echo "    make analyze        … クライアント bundle 分析（webpack-bundle-analyzer）"
	@echo "    make start          … サーバー起動（bun run start）→ 通常 http://localhost:3000/"
	@echo "    make typecheck      … ワークスペース全体の型チェック"
	@echo "    make format         … oxlint --fix + oxfmt"
	@echo "    make clean          … ビルド成果物・E2E 一時出力の削除（$(APP_DIR)/dist など）"
	@echo ""
	@echo "  シード（server パッケージ）"
	@echo "    make seed-generate  … シード生成"
	@echo "    make seed-insert    … DB へシード投入"
	@echo "    make db-reset       … DB を初期シードで再作成"
	@echo ""
	@echo "  E2E / VRT（application/README.md）"
	@echo "    make playwright-install … Chromium の取得（初回）"
	@echo "    make e2e-test       … Playwright 実行（E2E_SPEC/E2E_GREP で絞り込み可）"
	@echo "    make e2e-core       … ホーム/検索/投稿詳細/利用規約/レスポンシブ"
	@echo "    make e2e-auth       … 認証/ユーザー詳細"
	@echo "    make e2e-post       … 投稿機能中心"
	@echo "    make e2e-dm         … DM 機能"
	@echo "    make e2e-crok       … Crok チャット"
	@echo "    make e2e-full       … 全件実行（最終確認向け）"
	@echo "    make e2e-update     … スナップショット更新（環境差分がある場合）"
	@echo "    E2E_BASE_URL=https://... make e2e-test … リモート向け"
	@echo "    make e2e-test E2E_SPEC=\"src/posting.test.ts\" E2E_GREP=\"画像\""
	@echo ""
	@echo "  ローカル採点（scoring-tool/README.md）"
	@echo "    make score          … Lighthouse 計測（APPLICATION_URL を上書き可）"
	@echo "    make score-targets  … 計測名一覧"
	@echo "    make score-userflows… ユーザーフロー計測をまとめて実行"
	@echo "    make score-user-auth… ユーザーフロー: ユーザー登録 → サインアウト → サインイン"
	@echo "    make score-user-dm  … ユーザーフロー: DM送信"
	@echo "    make score-user-search … ユーザーフロー: 検索 → 結果表示"
	@echo "    make score-user-crok… ユーザーフロー: Crok AIチャット"
	@echo "    make score-user-post… ユーザーフロー: 投稿"
	@echo "    make score-one SCORE_TARGET=\"Crok\" … 計測名の部分一致で単体実行"
	@echo "    make format-scoring … scoring-tool のフォーマット"
	@echo ""
	@echo "  アセット最適化（ローカル Mac で実行、要 ffmpeg）"
	@echo "    make optimize-assets       … GIF→MP4変換 + JPEG圧縮（変換済みはスキップ）"
	@echo "    make optimize-assets-force … 強制再変換（--force）"
	@echo ""
	@echo "  コンテナ（Dockerfile — 本番相当ビルド）"
	@echo "    make docker-build   … docker build（ポート 8080 想定）"
	@echo ""
	@echo "  GCP（terraform/・gcloud / Cloud Build）詳細: docs/deployment.md"
	@echo "    make gcp-deploy     … ビルド→push→terraform apply→新リビジョン作成（通常デプロイ）"
	@echo "    make gcp-deploy TAG=手動タグ … タグを固定してデプロイ"
	@echo "    make gcp-redeploy   … ビルドなし・現タグで Cloud Run リビジョンを強制再作成"
	@echo "    make gcp-logs       … Cloud Run のライブログを表示"
	@echo "    make terraform-init … terraform init（$(TF_DIR)）"
	@echo "    make terraform-fmt  … terraform fmt（$(TF_DIR)）"
	@echo "    make terraform-validate … terraform validate"
	@echo "    make terraform-plan … terraform plan（terraform.tfvars があれば自動読込）"
	@echo "    make terraform-plan IMAGE_TAG=abc … image_tag を CLI で指定"
	@echo "    make terraform-apply … terraform apply（対話確認）"
	@echo "    make terraform-output … load_balancer_ip を表示"
	@echo "    事前: cp $(TF_DIR)/terraform.tfvars.example $(TF_DIR)/terraform.tfvars"

.PHONY: setup mise-trust mise-install install install-app install-scoring
setup: mise-trust mise-install install

mise-trust:
	mise trust

mise-install:
	mise install

install: install-app install-scoring

install-app:
	cd $(APP_DIR) && bun install --frozen-lockfile

install-scoring:
	cd $(SCORE_DIR) && bun install --frozen-lockfile

.PHONY: optimize-assets optimize-assets-force
optimize-assets:
	cd $(APP_DIR)/server && bun run optimize-assets

optimize-assets-force:
	cd $(APP_DIR)/server && bun run optimize-assets:force

.PHONY: build analyze start typecheck format clean
build:
	cd $(APP_DIR) && bun run build

analyze:
	cd $(APP_DIR) && bun run analyze

clean:
	rm -rf $(APP_DIR)/dist $(APP_DIR)/e2e/test-results

start:
	cd $(APP_DIR) && bun run start

typecheck:
	cd $(APP_DIR) && bun run typecheck

format:
	cd $(APP_DIR) && bun run format

.PHONY: seed-generate seed-insert db-reset
seed-generate:
	cd $(APP_DIR) && bun run --filter @web-speed-hackathon-2026/server seed:generate

seed-insert:
	cd $(APP_DIR) && bun run --filter @web-speed-hackathon-2026/server seed:insert

db-reset: seed-generate
	cd $(APP_DIR) && bun run --filter @web-speed-hackathon-2026/server seed:insert

.PHONY: playwright-install e2e-test e2e-core e2e-auth e2e-post e2e-dm e2e-crok e2e-full e2e-update \
	e2e-home e2e-search e2e-post-detail e2e-terms e2e-responsive \
	e2e-auth-auth-modal e2e-user-profile \
	e2e-posting e2e-dm-single e2e-crok-chat-single
playwright-install:
	cd $(APP_DIR)/e2e && bunx playwright install chromium

e2e-test:
	cd $(APP_DIR)/e2e && \
		$(if $(E2E_BASE_URL),E2E_BASE_URL=$(E2E_BASE_URL) ,)bunx playwright test $(E2E_SPEC) $(if $(E2E_GREP),--grep "$(E2E_GREP)",)

e2e-core:
	$(MAKE) e2e-home
	$(MAKE) e2e-search
	$(MAKE) e2e-post-detail
	$(MAKE) e2e-terms
	$(MAKE) e2e-responsive

e2e-auth:
	$(MAKE) e2e-auth-auth-modal
	$(MAKE) e2e-user-profile

e2e-post:
	$(MAKE) e2e-posting
	$(MAKE) e2e-post-detail

e2e-dm:
	$(MAKE) e2e-dm-single

e2e-crok:
	$(MAKE) e2e-crok-chat-single

# 以下は e2e の細かい分割ターゲット（テストファイル単位）
#
# 既存の大枠ターゲット（e2e-core/e2e-auth/e2e-post/...）は後方互換のため残し、
# これらの小分けターゲットを呼ぶようにしています。
e2e-home:
	$(MAKE) e2e-test E2E_SPEC="src/home.test.ts"

e2e-search:
	$(MAKE) e2e-test E2E_SPEC="src/search.test.ts"

e2e-post-detail:
	$(MAKE) e2e-test E2E_SPEC="src/post-detail.test.ts"

e2e-terms:
	$(MAKE) e2e-test E2E_SPEC="src/terms.test.ts"

e2e-responsive:
	$(MAKE) e2e-test E2E_SPEC="src/responsive.test.ts"

e2e-auth-auth-modal:
	$(MAKE) e2e-test E2E_SPEC="src/auth.test.ts"

e2e-user-profile:
	$(MAKE) e2e-test E2E_SPEC="src/user-profile.test.ts"

e2e-posting:
	$(MAKE) e2e-test E2E_SPEC="src/posting.test.ts"

e2e-dm-single:
	$(MAKE) e2e-test E2E_SPEC="src/dm.test.ts"

e2e-crok-chat-single:
	$(MAKE) e2e-test E2E_SPEC="src/crok-chat.test.ts"

e2e-full:
	$(MAKE) e2e-test

e2e-update:
	cd $(APP_DIR)/e2e && bunx playwright test --update-snapshots

.PHONY: score score-targets score-one score-userflows score-user-auth score-user-dm score-user-search score-user-crok score-user-post format-scoring
score:
	cd $(SCORE_DIR) && bun run start --applicationUrl $(APPLICATION_URL)

score-targets:
	cd $(SCORE_DIR) && bun run start --applicationUrl $(APPLICATION_URL) --targetName

# 計測名を部分一致で指定して 1 つだけ実行
score-one:
	cd $(SCORE_DIR) && bun run start --applicationUrl $(APPLICATION_URL) --targetName "$(SCORE_TARGET)"

# ユーザーフロー計測をまとめて実行（同一環境を使い回すと原因切り分けしやすい）
score-userflows:
	$(MAKE) score-user-auth
	$(MAKE) score-user-dm
	$(MAKE) score-user-search
	$(MAKE) score-user-crok
	$(MAKE) score-user-post

# ユーザーフロー個別実行ターゲット
score-user-auth:
	$(MAKE) score-one SCORE_TARGET="ユーザーフロー: ユーザー登録 → サインアウト → サインイン"

score-user-dm:
	$(MAKE) score-one SCORE_TARGET="ユーザーフロー: DM送信"

score-user-search:
	$(MAKE) score-one SCORE_TARGET="ユーザーフロー: 検索 → 結果表示"

score-user-crok:
	$(MAKE) score-one SCORE_TARGET="ユーザーフロー: Crok AIチャット"

score-user-post:
	$(MAKE) score-one SCORE_TARGET="ユーザーフロー: 投稿"

format-scoring:
	cd $(SCORE_DIR) && bun run format

.PHONY: docker-build
docker-build:
	docker build -t web-speed-hackathon-2026 .

# --- GCP / Terraform ---
# -chdir 指定時も確実に読むため、tfvars は絶対パスで渡す
TFVARS_FILE := $(abspath $(TF_DIR)/terraform.tfvars)
TFVARS_OPT  := $(if $(wildcard $(TF_DIR)/terraform.tfvars),-var-file=$(TFVARS_FILE),)
IMAGE_VAR   := $(if $(IMAGE_TAG),-var=image_tag=$(IMAGE_TAG),)

# GCP_PROJECT_ID / GCP_REGION / CLOUD_RUN_SERVICE は環境変数または gcloud config で設定
GCP_PROJECT_ID ?=
GCP_REGION     ?= asia-northeast1
CLOUD_RUN_SERVICE ?= wsh-app

# 現在デプロイ済みのイメージを取得（gcp-redeploy 用）
_CURRENT_IMAGE = $(shell terraform -chdir=$(TF_DIR) output -raw 2>/dev/null || echo "")
_DEPLOYED_TAG   = $(shell git -C . rev-parse --short HEAD)
_DEPLOYED_IMAGE = $(GCP_REGION)-docker.pkg.dev/$(shell gcloud config get-value project 2>/dev/null)/web-speed-hackathon-2026/app:$(_DEPLOYED_TAG)

.PHONY: gcp-deploy gcp-redeploy gcp-logs terraform-init terraform-fmt terraform-validate terraform-plan terraform-apply terraform-output
gcp-deploy:
	./scripts/deploy-gcp.sh $(TAG)

gcp-redeploy:
	gcloud run deploy $(CLOUD_RUN_SERVICE) \
	  --image=$(_DEPLOYED_IMAGE) \
	  --region=$(GCP_REGION) \
	  --quiet

gcp-logs:
	gcloud run services logs tail $(CLOUD_RUN_SERVICE) \
	  --region=$(GCP_REGION) \
	  --project=$(shell gcloud config get-value project 2>/dev/null)

terraform-init:
	terraform -chdir=$(TF_DIR) init

terraform-fmt:
	terraform -chdir=$(TF_DIR) fmt -recursive

terraform-validate:
	terraform -chdir=$(TF_DIR) validate

terraform-plan:
	terraform -chdir=$(TF_DIR) plan $(TFVARS_OPT) $(IMAGE_VAR)

terraform-apply:
	terraform -chdir=$(TF_DIR) apply $(TFVARS_OPT) $(IMAGE_VAR)

terraform-output:
	terraform -chdir=$(TF_DIR) output load_balancer_ip
