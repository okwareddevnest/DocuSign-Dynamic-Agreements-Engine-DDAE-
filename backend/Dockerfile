FROM node:20-alpine

WORKDIR /app

# Install dependencies first (better layer caching)
COPY package*.json ./
RUN npm ci

# Copy source code
COPY . .

# Build TypeScript code
RUN npm run build

# Expose API port
EXPOSE ${API_PORT}

# Start the server
CMD ["npm", "start"] 