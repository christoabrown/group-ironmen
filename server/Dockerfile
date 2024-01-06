###############################################
# Backend Image
###############################################
FROM rust:1.73 as builder
WORKDIR /app
COPY src ./src
COPY Cargo.toml .
COPY Cargo.lock .
COPY collection_log_info.json .
RUN cargo build --release

FROM debian:bookworm-slim
WORKDIR /app
RUN apt-get update
RUN apt-get install -y openssl ca-certificates
RUN rm -rf /var/lib/apt/lists/*
COPY --from=builder /app/target/release/server ./
COPY --from=builder /app/collection_log_info.json ./
COPY ./docker-entrypoint.sh ./

ENTRYPOINT ["/app/docker-entrypoint.sh"]
CMD ["/app/server"]
