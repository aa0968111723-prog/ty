# Zeabur: repo Dockerfile (and any dashboard-injected spec.source.dockerfile)
# must build with NITRO_PRESET=node-server. The default `npm run build` still
# emits Vercel output (`.vercel/output`); zbpack's Node path copies `/src/dist`
# which does not exist. Do not sed-replace `preset: "vercel"` — vite honors
# NITRO_PRESET at config time.
FROM node:22-bookworm-slim AS build
WORKDIR /src
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ENV NITRO_PRESET=node-server
RUN npm run build

FROM node:22-bookworm-slim
WORKDIR /src
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV NITRO_HOST=0.0.0.0
ENV PORT=8080
COPY --from=build /src/.output ./.output
EXPOSE 8080
CMD ["node", ".output/server/index.mjs"]
