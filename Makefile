.PHONY: version-tag
GIT_REF = $(shell git rev-parse --short HEAD)

version-tag:
	@echo $(shell git describe --tags --exact-match 2> /dev/null || echo "$(GIT_REF)")
