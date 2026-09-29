###############################################
# Frontend Image
###############################################
FROM node:24-alpine AS build

WORKDIR /app

COPY ["./package.json", "./package-lock.json", "./"]
RUN npm ci --ignore-scripts

COPY . .
RUN npm run bundle

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production

COPY ["./package.json", "./package-lock.json", "./"]
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

COPY --from=build /app/public ./public
COPY --from=build /app/scripts/server.js ./scripts/server.js

USER node
EXPOSE 4000
CMD ["node", "scripts/server.js"]
