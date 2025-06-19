FROM node:18-slim

WORKDIR /app

COPY package.json package-lock.json ./

RUN npm install

COPY src/ ./src/
COPY scripts/ ./scripts/

ENV NODE_ENV=production

CMD ["npm", "start"]