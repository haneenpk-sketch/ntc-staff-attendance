FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY railway/package*.json ./
RUN npm ci --no-audit --no-fund
COPY app ./app
COPY lib ./lib
COPY railway ./railway
RUN node railway/build.mjs

FROM node:24-bookworm-slim
WORKDIR /app
COPY --from=build /app/build ./build
COPY drizzle/*.sql ./drizzle/
COPY public/office-connector.py ./public/
ENV NODE_ENV=production
CMD ["node","build/server.mjs"]
