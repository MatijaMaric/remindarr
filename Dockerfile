# Stage 1: Build frontend
FROM oven/bun:1.3.9 AS frontend-build
WORKDIR /app
COPY package.json bun.lock ./
COPY frontend/package.json frontend/bun.lock ./frontend/
RUN cd frontend && bun install --frozen-lockfile
COPY frontend/ ./frontend/
RUN cd frontend && bun run build

# Stage 2: Build server
FROM oven/bun:1.3.9 AS server-build
WORKDIR /app
COPY package.json bun.lock ./
COPY frontend/package.json ./frontend/
RUN bun install --frozen-lockfile --production
COPY server/ ./server/
COPY tsconfig.json ./

# Stage 3: Production
FROM oven/bun:1.3.9-slim
WORKDIR /app
COPY --from=server-build /app/ ./
COPY --from=frontend-build /app/frontend/dist ./frontend/dist
EXPOSE 3000
VOLUME /app/data
ENV DB_PATH=/app/data/remindarr.db
CMD ["bun", "run", "server/index.ts"]
