# Build stage
FROM node:20.11.1-alpine as builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Production stage
FROM node:20.11.1-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --production

# Copy built files from builder stage
COPY --from=builder /app/dist ./dist

# Server configuration
ENV PORT=3000
ENV NODE_ENV=production

# Logging configuration
ENV LOG_LEVEL=INFO

# Expose the port the app runs on
EXPOSE 3000

LABEL org.opencontainers.image.source https://github.com/stefan79/agent_backend

# Start the application
CMD ["npm", "start"]
