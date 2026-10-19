FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=3000 LISHA_DATA_DIR=/app/data
COPY --from=build /app/dist ./dist
COPY server ./server
COPY shared ./shared
COPY src/data.js ./src/data.js
COPY package.json ./package.json
COPY scripts/setup-demo.mjs ./scripts/setup-demo.mjs
COPY demo-catalog ./demo-catalog
RUN mkdir /app/data && chown node:node /app/data
USER node
VOLUME ["/app/data"]
EXPOSE 3000
CMD ["node", "server/index.mjs"]
