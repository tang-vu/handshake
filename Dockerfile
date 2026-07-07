# Build stage: full node image (includes python3 + build-essential) so the
# better-sqlite3 native addon compiles reliably without depending on a
# prebuilt-binary download.
FROM node:20-bookworm AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build
# Drop devDependencies but keep the compiled better-sqlite3 binary.
RUN npm prune --omit=dev

# Runtime stage: slim image. The compiled better-sqlite3 .node from the build
# stage runs here unchanged — same Debian bookworm base, same Node 20 ABI.
FROM node:20-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
# SQLite lives on a mounted volume; see docker-compose.yml
VOLUME /app/data
EXPOSE 8787
CMD ["node", "dist/server.js"]
