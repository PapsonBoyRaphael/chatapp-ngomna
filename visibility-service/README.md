# -------------------------------------------------------------------------------------- #
# NGOMNA



# Visibility Microservice
    An Express.js-based microservice for managing visibility in an instant chat app, using Neo4j for organizational hierarchy and PostgreSQL for agent details.
    Prerequisites

# Node.js 18+
# Docker Desktop
# VS Code with JavaScript and Docker extensions

# Setup

# Clone the repository:git clone <repository-url>
# cd visibility


# Install dependencies:npm install


# Create a .env file (see .env artifact).
# Run with Docker:docker-compose up --build


# Access the API at http://localhost:3000.

# Development

# Run locally: npm run dev
# Lint code: npm run lint
# Format code: npm run format
# Access Neo4j Browser: http://localhost:7474
# Access PostgreSQL: psql -h localhost -U admin -d visibility

# Project Structure

src/domain/: Business logic (entities, services).
src/application/: Use cases.
src/infrastructure/: Database and web layers.
src/config/: Configuration.
tests/: Unit and integration tests.

