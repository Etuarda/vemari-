.PHONY: install dev build test lint up down migrate seed logs

install:
	npm ci

up:
	docker compose up -d --build

down:
	docker compose down

logs:
	docker compose logs -f api worker web

migrate:
	docker compose run --rm api npm run prisma:migrate:deploy

seed:
	docker compose run --rm api npm run prisma:seed

dev:
	npm run dev

build:
	npm run build

test:
	npm run test

lint:
	npm run lint
