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

# Copy template (the one we actually edit)
COPY nginx.conf.template /etc/nginx/templates/default.conf.template

# Generate nginx conf at runtime using env vars
CMD ["/bin/sh", "-lc", "envsubst '$PORT $BACKEND_URL' < /etc/nginx/templates/default.conf.template > /etc/nginx/conf.d/default.conf && nginx -g 'daemon off;'"]
