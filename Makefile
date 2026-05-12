COMPOSE ?= $(shell command -v podman >/dev/null 2>&1 && echo podman compose || echo docker compose)

.PHONY: build
build:
	$(COMPOSE) build

.PHONY: up-open-responses
up-open-responses:
	$(COMPOSE) up -d open-responses

.PHONY: doctor
doctor:
	./bin/jeanclaude doctor

.PHONY: ping
ping:
	./bin/jeanclaude ping

.PHONY: run
run:
	./bin/jeanclaude run "$(PROMPT)"

.PHONY: web-search
web-search:
	./bin/jeanclaude web-search "$(QUERY)"

.PHONY: document-ingest
document-ingest:
	./bin/jeanclaude document ingest "$(FILE)"

.PHONY: document-ask
document-ask:
	./bin/jeanclaude document ask "$(QUESTION)"

.PHONY: gateway-build
gateway-build:
	cd gateway && npm run build

.PHONY: gateway-test
gateway-test:
	cd gateway && npm test

.PHONY: check
check:
	./scripts/check.sh

.PHONY: smoke
smoke:
	./scripts/smoke-all.sh

.PHONY: package
package:
	./scripts/package.sh --check
