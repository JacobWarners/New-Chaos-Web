# Stage 1: Build the React Frontend
FROM node:20-alpine AS frontend-builder
WORKDIR /app
COPY client/package.json client/yarn.lock ./
RUN yarn install
COPY client/ ./
RUN yarn build

# Stage 2: Build the Go Backend
FROM golang:1.25-alpine AS backend-builder
RUN apk add --no-cache git openssh-client
WORKDIR /app
# Add GitHub to known hosts for non-interactive clone
RUN mkdir -p /root/.ssh && chmod 700 /root/.ssh
RUN ssh-keyscan github.com >> /root/.ssh/known_hosts
# Clone the repository using the default SSH mount
RUN --mount=type=ssh git clone git@github.com:weka/Chaos-Lab.git /scenarios
# Build the Go application
COPY server/go.mod server/go.sum ./
RUN go mod download
COPY server/ ./
RUN go mod tidy
RUN CGO_ENABLED=0 GOOS=linux go build -o /server_app .

# Stage 3: Final Production Image
FROM alpine:latest
# Install runtime dependencies
ARG TERRAFORM_VERSION=1.8.0
RUN apk add --no-cache curl unzip openssh-client git
RUN curl -LO "https://releases.hashicorp.com/terraform/${TERRAFORM_VERSION}/terraform_${TERRAFORM_VERSION}_linux_amd64.zip" && \
    unzip "terraform_${TERRAFORM_VERSION}_linux_amd64.zip" -d /usr/local/bin && \
    rm "terraform_${TERRAFORM_VERSION}_linux_amd64.zip"

RUN mkdir -p /root/.ssh && \
    chmod 700 /root/.ssh && \
    printf "Host github.com\n\
  HostName github.com\n\
  User git\n\
  IdentityFile /root/.ssh/id_git_rsa\n\
  StrictHostKeyChecking no\n\
  UserKnownHostsFile /dev/null\n" > /root/.ssh/config && \
    chmod 600 /root/.ssh/config

WORKDIR /app

# Copy the compiled Go binary
COPY --from=backend-builder /server_app .

# --- THIS IS THE FIX ---
# Copy the cloned scenario files from the builder stage into the final image.
# This creates the /app/scenarios directory that your Go app is looking for.
COPY --from=backend-builder /scenarios/scenario-tfs ./scenarios

# Copy the built React app assets
COPY --from=frontend-builder /app/dist ./static

EXPOSE 5000
CMD ["./server_app"]
