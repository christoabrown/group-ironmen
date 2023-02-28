###############################################
# Backend Image
###############################################
FROM rust:1.67 as builder
WORKDIR /app
COPY src ./src
COPY Cargo.toml .
COPY Cargo.lock .
RUN cargo build --release

FROM debian:bullseye-slim
WORKDIR /app
RUN apt-get update
RUN apt-get install -y openssl ca-certificates
RUN rm -rf /var/lib/apt/lists/*
COPY --from=builder /app/target/release/server ./
COPY ./docker-entrypoint.sh ./

ENTRYPOINT ["/app/docker-entrypoint.sh"]
CMD ["/app/server"]
