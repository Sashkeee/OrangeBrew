FROM node:22-alpine AS builder

# Create app directory
WORKDIR /app

# Install build dependencies for native modules (better-sqlite3, serialport)
RUN apk add --no-cache python3 make g++

# Install app dependencies
COPY package*.json ./
RUN npm install

# Copy app source
COPY . .

# Final stage
FROM node:22-alpine

WORKDIR /app

COPY --from=builder /app /app

# Ensure data directory exists for SQLite
RUN mkdir -p /app/data

EXPOSE 3001

CMD ["npm", "start"]
