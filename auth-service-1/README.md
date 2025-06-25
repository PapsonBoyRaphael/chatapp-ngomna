# Authentication Service

A microservice for authenticating agents based on their matricule, built with Node.js, Express, and PostgreSQL using clean architecture.

## Prerequisites
- Node.js 18+
- Docker and Docker Compose
- Existing PostgreSQL database with a `personnel` table containing agent data

## Setup
1. Clone the repository.
2. Copy `.env.example` to `.env` and update environment variables (e.g., POSTGRES_HOST, POSTGRES_USER, POSTGRES_PASSWORD to match your database).
3. Ensure your PostgreSQL database has the `personnel` table with columns: `matricule`, `nom`, `prenom`, `sexe`, `mmnaissance`, `aanaissance`, `lieunaissance`, `ministere`, `rang`.
4. Run `docker-compose up --build` to start the services.
5. Access the service at `http://localhost:3000`.

## Database
The service queries an existing `personnel` table in PostgreSQL. Ensure the database is running and accessible with the credentials specified in `.env`.

## Development
- Run `npm install` to install dependencies.
- Use `npm run dev` for development with nodemon.

## Notes
- The service uses Express sessions to store authenticated agent data, which is passed to the visibility service via redirect.
- If a matricule is not found, a red error message is displayed on the authentication page.
- The frontend uses EJS with Tailwind CSS, styled in light green and white.