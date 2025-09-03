# Stage 1: Build the React Frontend
FROM node:20-alpine AS frontend-builder
WORKDIR /app
COPY client/package.json client/yarn.lock ./
RUN yarn install
COPY client/ ./
RUN yarn build

# Stage 2: Build the Go Backend
FROM golang:1.25-alpine AS backend-builder
RUN apk add --no-cache git
WORKDIR /app
COPY server/go.mod server/go.sum ./
RUN go mod download
COPY server/ ./
RUN CGO_ENABLED=0 GOOS=linux go build -o /server_app .

# Stage 3: Final Production Image
FROM alpine:latest

# Install runtime dependencies: Terraform, curl, and now openssh-client
ARG TERRAFORM_VERSION=1.8.0
RUN apk add --no-cache curl unzip openssh-client git

RUN curl -LO "https://releases.hashicorp.com/terraform/${TERRAFORM_VERSION}/terraform_${TERRAFORM_VERSION}_linux_amd64.zip" && \
    unzip "terraform_${TERRAFORM_VERSION}_linux_amd64.zip" -d /usr/local/bin && \
    rm "terraform_${TERRAFORM_VERSION}_linux_amd64.zip"

# --- THIS IS THE NEW SECTION ---
# Create the .ssh directory and the config file that tells git/ssh
# which private key to use for github.com.
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
# Copy the Terraform configuration files
COPY terraform/ ./terraform/
# Copy the built React app assets
COPY --from=frontend-builder /app/dist ./static

EXPOSE 5000
CMD ["./server_app"]
