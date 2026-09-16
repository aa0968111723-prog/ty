# Zeabur Node runtime. zbpack-v2 currently mis-detects this Vite + TanStack Start
# app as a static site and COPY /src/dist into caddy-static; Nitro never emits dist.
# Keep the working 2026-09-15 layout: node:22 build → copy `.output` → node server.
FROM node:22-bookworm AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ENV NITRO_PRESET=node-server
RUN npm run build

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
ENV HOST=0.0.0.0
COPY --from=build /app/.output ./.output
COPY --from=build /app/package.json ./package.json
EXPOSE 8080
CMD ["node", ".output/server/index.mjs"]
