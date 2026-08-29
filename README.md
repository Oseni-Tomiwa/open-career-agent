# Open Career Agent

> **Early implementation:** the approved TypeScript modular-monolith foundation is now scaffolded. “Open Career Agent” is a temporary codename, not a permanent product brand.

Open Career Agent is exploring an open-source career intelligence platform that helps a candidate answer:

> Of all the opportunities available to me, which ones are actually worth my time, why, and what should I do next?

The product thesis is that useful career guidance must evaluate whether an opportunity is realistically attainable before assessing fit, explain its reasoning and uncertainty, and ground candidate claims in verified evidence. Jobs are the first planned opportunity type, but the domain direction is broader than jobs alone.

The repository now includes the Web/API and worker process foundations, canonical SQLite persistence, and a durable background-task ledger. The visible web page is a development bootstrap only; the production product interface has not been implemented yet.

## Development

Prerequisites are Node.js 24 LTS and pnpm 11.17.0. Docker and external services are not required.

```bash
corepack enable
corepack prepare pnpm@11.17.0 --activate
cp .env.example .env
pnpm install --frozen-lockfile
pnpm db:migrate
pnpm dev
```

See the [development setup guide](docs/development/setup.md) for service endpoints, commands, data location, testing, and deferred work.

## Documentation

- [Vision](docs/product/vision.md)
- [Product principles](docs/product/principles.md)
- [Personas](docs/product/personas.md)
- [User journeys](docs/product/user-journeys.md)
- [v0.1 scope](docs/product/v0.1-scope.md)
- [Intelligence specifications](docs/intelligence/README.md)
- [Reference-system research](docs/research/)
- [Architecture status](docs/architecture/README.md)
- [Architecture decision records](docs/adrs/README.md)
- [Implementation stack and repository strategy](docs/implementation/stack-evaluation.md)
- [Development setup](docs/development/setup.md)

## License

This project is available under the [MIT License](LICENSE).
