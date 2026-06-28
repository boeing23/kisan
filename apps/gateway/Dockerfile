# Kisan Alert gateway — Cloud Run image. Builds the whole TS monorepo, ships
# only the gateway + its workspace deps. Credentials are NOT baked in; mount the
# service account via Secret Manager / GOOGLE_APPLICATION_CREDENTIALS at runtime.
FROM node:20-slim AS build
WORKDIR /app
# Copy manifests first for layer caching.
COPY package.json package-lock.json tsconfig.base.json tsconfig.json ./
COPY packages ./packages
COPY apps ./apps
RUN npm ci
RUN npm run build

FROM node:20-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
# Bring built output + production deps.
COPY --from=build /app/package.json /app/package-lock.json /app/tsconfig.base.json /app/tsconfig.json ./
COPY --from=build /app/packages ./packages
COPY --from=build /app/apps ./apps
COPY --from=build /app/node_modules ./node_modules
ENV PORT=8080
EXPOSE 8080
CMD ["node", "apps/gateway/dist/server.js"]
