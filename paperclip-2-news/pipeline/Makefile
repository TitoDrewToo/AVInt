.PHONY: setup verify render clean help

setup: ## Install all dependencies
	./scripts/setup.sh

verify: ## End-to-end smoke test
	./scripts/verify.sh

render: ## Render the Remotion smoke test
	npm run render:smoke

clean: ## Remove tools, dependency directories, and renders
	rm -rf tools node_modules .venv assets/renders

help: ## List targets
	@awk 'BEGIN {FS = ":.*##"; printf "Targets:\n"} /^[a-zA-Z_-]+:.*##/ {printf "  %-10s %s\n", $$1, $$2}' $(MAKEFILE_LIST)
