FROM node:20-alpine

WORKDIR /app

# Install dependencies first (layer cache)
COPY package*.json ./
RUN npm ci --omit=dev

# Copy application source
COPY . .

# /config is the persistent volume for the database
RUN mkdir -p /config

EXPOSE 3000

ENV NODE_ENV=production \
    PORT=3000 \
    DB_PATH=/config/inventory.db

CMD ["node", "server.js"]
