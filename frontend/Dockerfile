# ---------- build ----------
FROM node:20-alpine AS build
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# ---------- run ----------
FROM nginx:alpine
RUN apk add --no-cache gettext

COPY --from=build /app/dist /usr/share/nginx/html

# Nginx template
COPY nginx.conf /etc/nginx/templates/default.conf.template

# Railway provides $PORT dynamically
CMD ["/bin/sh", "-c", "envsubst '$PORT $BACKEND_URL' < /etc/nginx/templates/default.conf.template > /etc/nginx/conf.d/default.conf && nginx -g 'daemon off;'"]
