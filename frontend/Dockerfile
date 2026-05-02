FROM oven/bun:1 AS base
WORKDIR /usr/src/app

# install dependencies into temp directory
# this will cache them and speed up future builds
FROM base AS install
WORKDIR /temp/dev
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# copy node_modules from temp directory
# then copy all project files into the image
FROM base AS build
COPY --from=install /temp/dev/node_modules node_modules
COPY . .
# Build, then precompress static assets for nginx gzip_static
RUN bun run build \
    && find dist -type f \( -name '*.js' -o -name '*.css' -o -name '*.html' -o -name '*.svg' -o -name '*.json' \) \
        -exec sh -c 'gzip -9 -k -f "$1"' _ {} \;

# serve with nginx
FROM nginx:alpine
COPY --from=build /usr/src/app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 5173
HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
    CMD wget -qO- http://127.0.0.1:5173/healthz >/dev/null || exit 1
