# Visibility Service

A microservice for managing agent-unit relationships and visibility in a chat app, built with Node.js, Express, and Neo4j using clean architecture.

## Prerequisites
- Node.js 18+
- Docker and Docker Compose
- Neo4j database with organizational chart and agent data
- Authentication service running (for session data)

## Setup
1. Clone the repository.
2. Copy `.env.example` to `.env` and update environment variables (e.g., NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD to match your Neo4j instance).
3. Ensure Neo4j is populated with the organizational chart and agent data (see provided Cypher scripts).
4. Run `docker-compose up --build` to start the services.
5. Access the service at `http://localhost:3001/visibility`.

## Database
The service uses a Neo4j database with `:Unit` and `:Agent` nodes, connected by `:OVERSEES`, `:REPORTS_TO`, and rank-based relationships (e.g., `:MINISTRE_D_ETAT`).

## Development
- Run `npm install` to install dependencies.
- Use `npm run dev` for development with nodemon.

## Notes
- The service shares Express sessions with the auth service to access authenticated agent data.
- French characters in `rang` (e.g., "Ministre d'Etat") are normalized to `MINISTRE_D_ETAT` for relationships.
- The frontend uses EJS with Tailwind CSS, styled in light green and white.
- Autocomplete for unit selection uses a simple `<datalist>`.