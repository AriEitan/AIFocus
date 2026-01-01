# ---------- build ----------
FROM node:20-alpine AS build
WORKDIR /app

# Install deps
COPY package*.json ./
RUN npm ci

# Copy source and build
COPY . .
RUN npm run build

# ---------- run ----------
FROM nginx:alpine
RUN apk add --no-cache gettext

# Static files
COPY --from=build /app/dist /usr/share/nginx/html

# Nginx template
COPY nginx.conf /etc/nginx/templates/default.conf.template

# Listen on Railway $PORT
CMD ["/bin/sh", "-c", "envsubst '$PORT' < /etc/nginx/templates/default.conf.template > /etc/nginx/conf.d/default.conf && nginx -g 'daemon off;'"]
