# Stage 1: Build
FROM node:22-alpine AS builder

WORKDIR /app

# Install build dependencies for native modules
RUN apk add --no-cache python3 make g++

# Copy package files first for better caching
COPY package*.json ./

# Install ALL dependencies (including dev for building if needed, though here we just need native builds)
RUN npm install

# Copy source code (will skip node_modules due to .dockerignore)
COPY . .

# Stage 2: Production
FROM node:22-alpine

WORKDIR /app

# We need some runtime libraries that better-sqlite3 might depend on in some environments,
# though Alpine's node image usually has enough. 
# But let's copy the built node_modules and the app.
COPY --from=builder /app /app

# Ensure data directory exists
RUN mkdir -p /app/data

EXPOSE 3001

CMD ["npm", "start"]
