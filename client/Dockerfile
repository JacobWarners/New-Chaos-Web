# Stage 1: Builder
# Use an official Node.js image to build the React app
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package.json and yarn.lock and install dependencies. This is cached.
COPY client/package.json client/yarn.lock ./
RUN yarn install

# Copy the rest of the client source code
COPY client/ ./

# Build the production-ready static files
RUN yarn build

# ---

# Stage 2: Final Image
# Use an official Nginx image to serve the static files
FROM nginx:stable-alpine

# Remove the default Nginx welcome page
RUN rm /etc/nginx/conf.d/default.conf

# Copy our custom Nginx configuration (we will create this next)
COPY client/nginx.conf /etc/nginx/conf.d/default.conf

# Copy the built static assets from the builder stage to the Nginx html directory
COPY --from=builder /app/dist /usr/share/nginx/html

# Expose the port Nginx listens on
EXPOSE 80

# The default Nginx command will start the server, so we don't need a CMD.
