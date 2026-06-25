# ── Augur frontend image (multi-stage) ───────────────────────────────────────
# Stage 1: build the static bundle
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install
COPY . .
RUN npm run build

# Stage 2: serve with nginx + reverse-proxy /api to the backend
FROM nginx:1.27-alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/templates/default.conf.template

# These are templated into nginx.conf at container start by the official image's
# envsubst entrypoint. docker-compose supplies the real values.
ENV FRONTEND_PORT=3100 \
    BACKEND_HOST=backend \
    BACKEND_PORT=8100

EXPOSE 3100
# The nginx:alpine image runs envsubst on /etc/nginx/templates/*.template
# (using $FRONTEND_PORT, $BACKEND_HOST, $BACKEND_PORT) → default.conf, then starts.
