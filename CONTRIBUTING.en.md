# Contributing

[简体中文](CONTRIBUTING.md)

## Before you start

Read [README](README.en.md), [AGENTS.md](AGENTS.md), and [HARNESS.md](HARNESS.md). The backend, Flutter client, and this client are separate repositories. Backend API contracts are defined by its Swagger documentation.

Bug reports should include the client version/commit, platform/OS version, backend version, reproduction steps, and sanitized logs. See [bugs (Chinese)](docs/project/bugs.md) and the [handoff](docs/en/project/handoff.md) for known issues and outstanding device checks.

## Local development

```bash
pnpm install --frozen-lockfile
pnpm run build
pnpm run typecheck
pnpm test
pnpm run test:release
```

The postinstall hook and committed `patches/` are part of the build. Do not bypass them or commit dependencies, signing material, or generated output.

Native changes require checking TypeScript facades, implementations, registration, and event names together. Web changes require opening the built product; native changes require compiling the affected host. See [build and run](docs/en/guides/build-and-run.md) and [testing](docs/en/guides/testing.md).

## Commit conventions

Maintainers commit directly to `main`. External contributors can discuss changes in an Issue first and follow the maintainer's chosen submission process; feature branches and PRs are not mandatory repository procedures.

Use `type(scope): description` without `Co-Authored-By`. Reference backend issues as `songloft-org/songloft#123`. Update existing English counterparts together with Chinese docs. New installation, release, and contribution guides must remain bilingual.

Format changed files, run relevant checks and `git diff --check`, and report the validation scope. Unit/contract tests, host compilation, and actual device testing are distinct evidence.

## Releases

Only maintainers execute the [release process](docs/en/guides/releasing.md). The `dev` release rolls forward; version tags and published versioned releases are not overwritten. The project uses [Apache-2.0](LICENSE); third-party source and assets retain their original notices.
