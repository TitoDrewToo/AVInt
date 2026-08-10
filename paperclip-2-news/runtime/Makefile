.PHONY: setup verify sprint weekly review\:list review\:lock review\:kill review\:edit help

setup: ## Install dependencies and typecheck
	npm install
	npm run typecheck

verify: ## End-to-end team runtime smoke test
	npm run verify

sprint: ## Start pre-launch backlog sprint
	npm run sprint:start

weekly: ## Trigger weekly cycle manually
	npm run weekly:trigger

review\:list: ## List pending reviews
	npm run review:list

review\:lock: ## Approve an episode gate: make review:lock id=001
	npm run review:lock -- $(id)

review\:kill: ## Kill an episode gate: make review:kill id=001
	npm run review:kill -- $(id)

review\:edit: ## Open episode folder: make review:edit id=001
	npm run review:edit -- $(id)

help: ## List targets
	@awk 'BEGIN {FS = ":.*##"; printf "Targets:\n"} /^[a-zA-Z_\\:-]+:.*##/ {printf "  %-14s %s\n", $$1, $$2}' $(MAKEFILE_LIST)
